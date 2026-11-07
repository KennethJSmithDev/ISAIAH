param([switch]$IpmOnly, [switch]$Apply, [switch]$Standalone)
$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath (Split-Path -Parent $PSScriptRoot)
$ipm = Import-PowerShellDataFile -LiteralPath (Join-Path $PSScriptRoot 'ipm.psd1')
$state = New-Item -ItemType Directory -Path .local -Force
$principal = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
& icacls $state.FullName /inheritance:r /grant:r "*${principal}:(OI)(CI)F" | Out-Null
if ($LASTEXITCODE) { throw 'Could not restrict ISAIAH local state.' }

$installer = Join-Path $state.FullName "zpm-$($ipm.Version).xml"
$expected = $ipm.InstallerSha256
if (!(Test-Path -LiteralPath $installer)) {
    $download = $installer + '.download'
    Invoke-WebRequest -TimeoutSec 45 -Uri "https://github.com/intersystems/ipm/releases/download/v$($ipm.Version)/zpm-$($ipm.Version).xml" -OutFile $download
    if ((Get-FileHash -LiteralPath $download).Hash -ne $expected) { throw 'IPM release digest mismatch.' }
    Move-Item -LiteralPath $download -Destination $installer
}
if ((Get-FileHash -LiteralPath $installer).Hash -ne $expected) { throw 'IPM release digest mismatch.' }
if ($IpmOnly) {
    Write-Host "Verified IPM $($ipm.Version) installer."
    return
}

$secret = Join-Path $state.FullName 'compose-credentials.json'
if (!(Test-Path -LiteralPath $secret)) {
    $credentials = @{
        password = 'Is!' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(14))
        providerToken = [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
    }
    $credentials | ConvertTo-Json -Compress | Set-Content -LiteralPath $secret -Encoding utf8NoBOM
}
Write-Host "Verified IPM $($ipm.Version) installer and prepared the local Compose secret."
if ($Standalone) {
    $file = Join-Path $state.FullName 'developer.json'
    if (!(Test-Path -LiteralPath $file)) {
        [ordered]@{
            instance = [guid]::NewGuid().ToString()
            namespace = 'ISAIAHDEV'
            production = 'DevTrace.Production'
            traceUrl = 'http://trace:52773/isaiah-trace'
            tracePassword = 'Tr!' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(14))
        } | ConvertTo-Json -Compress | Set-Content -LiteralPath $file -Encoding utf8NoBOM
    }
}
if ($Apply) {
    $operatorFile = Join-Path $state.FullName 'apply-operator.txt'
    if (!(Test-Path -LiteralPath $operatorFile)) {
        $sandbox = [guid]::NewGuid().ToString()
        $operatorKey = 'IA!' + [Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
        [IO.File]::WriteAllText($operatorFile, "$sandbox`n$operatorKey`n", [Text.UTF8Encoding]::new($false))
    }
    Write-Host 'Prepared the separate apply sandbox operator file.'
}
