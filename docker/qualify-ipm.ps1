param([ValidateSet('iris','iris-for-health')][string]$Edition = 'iris-for-health')
$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
$pin = Import-PowerShellDataFile -LiteralPath (Join-Path $PSScriptRoot 'ipm.psd1')
if ($Edition -eq 'iris') {
    if ($env:ISAIAH_IRIS_STANDARD_ID -notmatch '^sha256:[0-9a-f]{64}$') { throw 'Set the authorized standard IRIS Community image pin.' }
    $pin.IrisImage = $env:ISAIAH_IRIS_STANDARD_ID
}
$docker = Get-Command docker.exe -CommandType Application | Select-Object -First 1 -ExpandProperty Source
$installer = Join-Path $repo ".local/zpm-$($pin.Version).xml"
if (!(Test-Path -LiteralPath $installer -PathType Leaf) -or
    (Get-FileHash -LiteralPath $installer).Hash -ne $pin.InstallerSha256) {
    throw 'The pinned IPM installer is missing or invalid. Run .\docker\prepare.ps1 -IpmOnly first.'
}
$null = Get-Command tar -CommandType Application

function Invoke-Docker([string[]]$Arguments, [string[]]$Lines, [int]$Timeout = 30, [string]$Log) {
    $info = [Diagnostics.ProcessStartInfo]::new($docker)
    $info.UseShellExecute = $false
    $info.RedirectStandardInput = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $process = [Diagnostics.Process]::Start($info)
    try {
        $output = $process.StandardOutput.ReadToEndAsync()
        $errors = $process.StandardError.ReadToEndAsync()
        if ($Lines) { $process.StandardInput.WriteLine($Lines -join "`n") }
        $process.StandardInput.Close()
        $finished = $process.WaitForExit($Timeout * 1000)
        if (!$finished) { $process.Kill($true) }
        $stdout = $output.GetAwaiter().GetResult()
        $stderr = $errors.GetAwaiter().GetResult()
        if ($Log) { ($stdout + $stderr) | Set-Content -LiteralPath (Join-Path $runDir $Log) }
        if (!$finished) { throw "Docker $($Arguments[0]) timed out after $Timeout seconds." }
        if ($process.ExitCode -ne 0) { throw "Docker $($Arguments[0]) failed (exit $($process.ExitCode)). $($stderr.Trim())" }
        $stdout.Trim()
    } finally {
        $process.Dispose()
    }
}

$localPipe = '^npipe:////\./pipe/'
$contextHost = Invoke-Docker @('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}')
if ($contextHost -notmatch $localPipe -or ($env:DOCKER_HOST -and $env:DOCKER_HOST -notmatch $localPipe) -or
    (Invoke-Docker @('version', '--format', '{{.Server.Os}}')) -ne 'linux') {
    throw 'Select a local Docker Desktop context in Linux container mode.'
}
if ((Invoke-Docker @('image', 'inspect', '--format', '{{.Id}}', $pin.IrisImage)) -ne $pin.IrisImage) {
    throw 'Load the authorized Build 154U image before qualifying IPM.'
}

$revision = git -C $repo rev-parse --verify HEAD
if ($LASTEXITCODE -ne 0) { throw 'Could not resolve the committed source.' }
$manifest = [xml]((git -C $repo show "${revision}:module.xml") -join "`n")
$module = $manifest.Export.Document.Module
$version = $module.Version
if ($module.Name -ne 'isaiah' -or $version -notmatch '^\d+\.\d+\.\d+$') {
    throw 'The committed manifest does not identify a supported ISAIAH package version.'
}
$namespaceSetup = @(git -C $repo show "${revision}:iris/setup-namespace.txt")
if ($LASTEXITCODE -ne 0) { throw 'Could not read the committed namespace setup.' }

$token = [guid]::NewGuid().ToString('N').Substring(0, 10)
$stamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$runDir = Join-Path $repo ".local/ipm-qualification/$stamp-$token"
$null = New-Item -ItemType Directory -Path $runDir -Force
$sourceTar = Join-Path $runDir 'source-input.tar'
$candidate = Join-Path $runDir 'candidate.tgz'
$archiveName = "isaiah-$version.tgz"
git -C $repo archive --format=tar --output=$sourceTar $revision module.xml LICENSE NOTICE.md iris/cls/Isaiah
if ($LASTEXITCODE -ne 0) { throw 'Could not stage the committed IPM inputs.' }
Write-Host "Qualification records: $runDir"

function Use-OfflineIris($role, [scriptblock]$Work) {
    $name = "isaiah-ipm-$token-$role"
    $id = Invoke-Docker @('run', '-d', '--rm', '--pull', 'never', '--network', 'none',
        '--name', $name, '--label', 'dev.isaiah.owner=ipm-qualification', $pin.IrisImage)
    if ($id -notmatch '^[0-9a-f]{64}$') { throw "Docker did not return an ID for $name." }
    try {
        $deadline = (Get-Date).AddSeconds(100)
        do {
            $health = Invoke-Docker @('inspect', '--format', '{{.State.Health.Status}}', $id)
            if ($health -eq 'healthy') { break }
            Start-Sleep -Seconds 2
        } while ((Get-Date) -lt $deadline)
        if ($health -ne 'healthy') { throw "Vendor health did not become healthy for $name." }
        Write-Host "$role sandbox ready ($($id.Substring(0, 12)))."
        & $Work $id
    } finally {
        try {
            [void](Invoke-Docker @('logs', '--tail', '100', $id) -Log "$role-container.txt")
        } finally {
            [void](Invoke-Docker @('stop', '--timeout', '30', $id) -Timeout 40)
        }
    }
}

function Invoke-IrisStep($id, $namespace, [string[]]$lines, $marker, $log) {
    $output = Invoke-Docker @('exec', '-i', $id, 'iris', 'session', 'IRIS', '-U', $namespace) -Lines ($lines + 'halt') -Timeout 125 -Log $log
    if ($output -notmatch "(?m)^$marker\r?$") { throw "IRIS did not complete $marker. See $log." }
    $output
}

function Initialize-Ipm($id, $role, [switch]$SkipInterop) {
    [void](Invoke-Docker @('exec', $id, 'mkdir', '-p', '/tmp/isaiah-ipm', '/usr/irissys/mgr/isaiah'))
    [void](Invoke-Docker @('cp', $installer, "${id}:/tmp/isaiah-ipm/zpm.xml"))
    $setup = if ($SkipInterop) { @('set isaiahSkipInterop=1') + $namespaceSetup } else { $namespaceSetup }
    [void](Invoke-IrisStep $id '%SYS' $setup 'ISAIAH-NAMESPACE-READY' "$role-namespace.txt")
    [void](Invoke-IrisStep $id 'ISAIAH' @(
        'write $ZVERSION,!'
        'if $ZVERSION''["2026.3.0AI (Build 154U)" halt'
        'if ##class(%Dictionary.ClassDefinition).%ExistsId("Isaiah.Api") halt'
        'set sc=$SYSTEM.OBJ.Load("/tmp/isaiah-ipm/zpm.xml","ck")'
        'if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt'
        'set sc=##class(%IPM.Main).GetIPMVersionInfo(.version,.mapped)'
        ('if $SYSTEM.Status.IsError(sc)!(version''="{0}") halt' -f $pin.Version)
        'write "IPM-BOOTSTRAPPED",!'
    ) 'IPM-BOOTSTRAPPED' "$role-ipm.txt")
}

$packager = Use-OfflineIris 'source' {
    param($id)
    Initialize-Ipm $id 'source'
    [void](Invoke-Docker @('exec', $id, 'mkdir', '-p', '/tmp/isaiah-ipm/source', "/tmp/isaiah-ipm/isaiah-$version"))
    [void](Invoke-Docker @('cp', $sourceTar, "${id}:/tmp/isaiah-ipm/source.tar"))
    [void](Invoke-Docker @('exec', $id, 'tar', '-xf', '/tmp/isaiah-ipm/source.tar', '-C', '/tmp/isaiah-ipm/source'))
    [void](Invoke-IrisStep $id 'ISAIAH' @(
        'set sc=##class(%IPM.Main).Shell("load /tmp/isaiah-ipm/source -nodev")'
        'if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt'
        ('set sc=##class(%IPM.Main).Shell("package isaiah -path /tmp/isaiah-ipm/isaiah-{0} -verbose")' -f $version)
        'if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt'
        'write "IPM-PACKAGED",!'
    ) 'IPM-PACKAGED' 'source-package.txt')
    [void](Invoke-Docker @('cp', "${id}:/tmp/isaiah-ipm/$archiveName", $candidate))
    $id
}
Remove-Item -LiteralPath $sourceTar

$files = @(tar -tzf $candidate | ForEach-Object { $_.TrimEnd('/') } |
    Where-Object { $_ -notin @('iris', 'iris/cls', 'iris/cls/Isaiah') })
if ($LASTEXITCODE -ne 0) { throw 'Could not list the IPM archive.' }
$expectedFiles = @('module.xml', 'LICENSE', 'NOTICE.md') + @(git -C $repo ls-tree -r --name-only $revision -- iris/cls/Isaiah)
if ($LASTEXITCODE -ne 0 -or (Compare-Object $expectedFiles $files -CaseSensitive)) {
    throw 'The archive files differ from the committed module, class and notice set.'
}
$exported = [xml]((tar -xOzf $candidate module.xml) -join "`n")
$exportedModule = $exported.Export.Document.Module
if ($LASTEXITCODE -ne 0 -or $exportedModule.Name -ne 'isaiah' -or $exportedModule.Version -ne $version -or
    $exportedModule.SystemRequirements.Version -ne '>=2026.3' -or $exportedModule.SystemRequirements.Interoperability -ne 'enabled') {
    throw 'The archive manifest lost the intended package identity or system requirements.'
}

$qualification = Use-OfflineIris 'install' {
    param($id)
    Initialize-Ipm $id 'install' -SkipInterop
    [void](Invoke-Docker @('cp', $candidate, "${id}:/tmp/isaiah-ipm/isaiah.tgz"))
    $load = 'set sc=##class(%IPM.Main).Shell("load /tmp/isaiah-ipm/isaiah.tgz -nodev")'
    $guard = Invoke-IrisStep $id 'ISAIAH' @(
        $load
        'if $SYSTEM.Status.IsOK(sc) halt'
        'if ##class(%Dictionary.ClassDefinition).%ExistsId("Isaiah.Api") halt'
        'do $SYSTEM.Status.DisplayError(sc)'
        'write "IPM-GUARD-REFUSED",!'
    ) 'IPM-GUARD-REFUSED' 'install-guard.txt'
    if ($guard -notmatch 'is not interoperability-enabled') { throw 'The archive failed for a reason other than the Interoperability guard.' }
    Write-Host 'Interoperability guard refused the archive before loading classes.'
    [void](Invoke-IrisStep $id '%SYS' $namespaceSetup 'ISAIAH-NAMESPACE-READY' 'install-enable-interop.txt')
    $loaded = Invoke-IrisStep $id 'ISAIAH' @(
        $load
        'if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt'
        'set rows=##class(%SQL.Statement).%ExecDirect(,"SELECT VersionString FROM %IPM_Storage.ModuleItem WHERE Name = ?","isaiah")'
        'if ''rows.%Next() halt'
        ('if rows.%Get("VersionString")''="{0}" halt' -f $version)
        'set sc=##class(Ens.Director).StartProduction("Isaiah.Production")'
        'if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt'
        'set sc=##class(Isaiah.Fixture).Seed()'
        'if $SYSTEM.Status.IsError(sc) do $SYSTEM.Status.DisplayError(sc) halt'
        'write "R17 ",##class(Isaiah.State).Fixture("R17").%ToJSON(),!'
        'write "R29 ",##class(Isaiah.State).Fixture("R29").%ToJSON(),!'
        'write "IPM-ARCHIVE-INSTALLED",!'
    ) 'IPM-ARCHIVE-INSTALLED' 'install-archive.txt'
    $r17, $r29 = $loaded -split '\r?\n' | Where-Object { $_ -match '^R(17|29) ' } |
        ForEach-Object { $_.Substring(4) | ConvertFrom-Json }
    if ($r17.incident -ne 'R17' -or $r17.ingress.priority -ne 'P1' -or $r17.router.matchPriority -ne 'PRIORITY' -or
        $r17.router.selectedDestination -ne 'Standard' -or $r17.receipts.Count -ne 1 -or
        $r17.receipts[0].destination -ne 'Standard' -or $r17.receipts[0].status -ne 'delivered' -or
        $r29.incident -ne 'R29' -or $r29.ingress.priority -ne 'P1' -or $r29.router.matchPriority -ne 'P1' -or
        $r29.router.selectedDestination -ne 'Express' -or $r29.receipts.Count -ne 2 -or
        $r29.receipts[0].destination -ne 'Express' -or $r29.receipts[0].status -ne 'unavailable' -or
        $r29.receipts[1].destination -ne 'Standard' -or $r29.receipts[1].status -ne 'delivered') {
        throw 'The installed production did not produce the expected R17 and R29 traces.'
    }
    @{ container = $id; cases = @($r17, $r29) }
}

$artifact = Join-Path $runDir $archiveName
$hash = (Get-FileHash -LiteralPath $candidate).Hash.ToLowerInvariant()
Move-Item -LiteralPath $candidate -Destination $artifact
@{
    status = 'pass'
    edition = $Edition
    sourceRevision = $revision
    irisImage = $pin.IrisImage
    ipmVersion = $pin.Version
    installerSha256 = $pin.InstallerSha256
    networkMode = 'none'
    packageContainer = $packager
    installContainer = $qualification.container
    package = $archiveName
    packageSha256 = $hash
    interopGuard = 'refused before class load'
    cases = $qualification.cases
} | ConvertTo-Json -Depth 10 | Set-Content -LiteralPath (Join-Path $runDir 'receipt.json')
Write-Host "Offline IPM qualification passed: $artifact"
