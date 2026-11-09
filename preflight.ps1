[CmdletBinding(DefaultParameterSetName = 'Compose')]
param(
    [Parameter(ParameterSetName = 'Compose')]
    [ValidatePattern('^[a-z0-9][a-z0-9_-]*$')]
    [string]$Project = 'isaiah-v010-package',

    [Parameter(ParameterSetName = 'Compose')]
    [switch]$Apply,

    [Parameter(ParameterSetName = 'Compose')]
    [switch]$Standalone,

    [Parameter(ParameterSetName = 'Compose')]
    [switch]$ProviderProfile,

    [Parameter(ParameterSetName = 'Compose')]
    [switch]$ProviderAuth,

    [ValidateSet('iris', 'iris-for-health')]
    [string]$Edition = 'iris-for-health',

    [Parameter(Mandatory, ParameterSetName = 'IPM')]
    [ValidatePattern('^[A-Za-z0-9][A-Za-z0-9_.-]*$')]
    [string]$IpmContainer,

    [Parameter(ParameterSetName = 'IPM')]
    [ValidatePattern('^[A-Za-z][A-Za-z0-9_-]*$')]
    [string]$Namespace = 'ISAIAH'
)

$ErrorActionPreference = 'Stop'
if ($ProviderAuth -and !$ProviderProfile) { throw 'ProviderAuth requires ProviderProfile.' }
$PSNativeCommandUseErrorActionPreference = $false
$hasAction = $false
$composeMode = $PSCmdlet.ParameterSetName -eq 'Compose'
$ipm = Import-PowerShellDataFile -LiteralPath (Join-Path $PSScriptRoot 'docker/ipm.psd1')
$qualifiedImage = if ($Edition -eq 'iris') { $env:ISAIAH_IRIS_STANDARD_ID } else { $ipm.IrisImage }

function Report($status, $check, $detail) {
    if ($status -eq 'ACTION') { $script:hasAction = $true }
    Write-Host "[$status] $check - $detail"
}

function Read-Docker([string[]]$Arguments) {
    $output = & docker @Arguments 2>$null
    if ($LASTEXITCODE -eq 0) { $output }
}

function Read-Loopback($port, $path) {
    Invoke-RestMethod -Uri "http://127.0.0.1:$port$path" -TimeoutSec 4 -NoProxy -MaximumRedirection 0
}

if (!(Get-Command docker -ErrorAction SilentlyContinue)) {
    Report ACTION Docker 'Install or locate Docker Desktop.'
    exit 1
}
$localPipe = '^npipe:////\./pipe/'
$contextHost = Read-Docker @('context', 'inspect', '--format', '{{.Endpoints.docker.Host}}')
if ($contextHost -notmatch $localPipe -or ($env:DOCKER_HOST -and $env:DOCKER_HOST -notmatch $localPipe)) {
    Report ACTION Docker 'Select a local Docker Desktop context before running the preflight.'
    exit 1
}
if ((Read-Docker @('version', '--format', '{{.Server.Os}}')) -ne 'linux') {
    Report ACTION Docker 'Start Docker Desktop in Linux container mode.'
    exit 1
}
Report OK Docker 'Local Linux container engine is reachable.'
if ($qualifiedImage -notmatch '^sha256:[0-9a-f]{64}$') {
    Report ACTION 'IRIS image' 'Load the authorized standard IRIS Community Build 154 image and set ISAIAH_IRIS_STANDARD_ID to its exact image ID.'
    exit 1
}

$target = $IpmContainer
$appRunning = $false
if ($composeMode) {
    $compose = @('compose', '-p', $Project, '--project-directory', $PSScriptRoot, '-f', (Join-Path $PSScriptRoot 'compose.yaml'))
    if ($Apply) { $compose += @('-f', (Join-Path $PSScriptRoot 'docker/compose.apply.yaml')) }
    if ($Standalone) { $compose += @('-f', (Join-Path $PSScriptRoot 'docker/compose.standalone.yaml')) }
    if ($ProviderProfile) { $compose += @('-f', (Join-Path $PSScriptRoot 'docker/compose.provider.yaml')) }
    if ($ProviderAuth) { $compose += @('-f', (Join-Path $PSScriptRoot 'docker/compose.provider-auth.yaml')) }
    if (!(Read-Docker @('compose', 'version', '--short'))) {
        Report ACTION Compose 'Enable the Docker Compose plugin.'
    } else {
        $config = Read-Docker ($compose + @('config', '--format', 'json')) | ConvertFrom-Json
        if (!$config) {
            Report ACTION Compose 'Set ISAIAH_IRIS_IMAGE to the loaded image and run docker compose config --quiet for details.'
        } else {
            if ($Standalone -and $config.services.app.environment.ISAIAH_EDITION -ne $Edition) {
                Report ACTION 'Edition profile' 'Set ISAIAH_EDITION to the edition being checked before starting Compose.'
            }
            $image = Read-Docker @('image', 'inspect', '--format', '{{.Id}}', $config.services.iris.image)
            if (!$image) {
                Report ACTION 'IRIS image' 'Load the authorized Build 154U image and set ISAIAH_IRIS_IMAGE to its local reference.'
            } elseif ($image -ne $qualifiedImage) {
                Report ACTION 'IRIS image' 'The selected image does not match the pinned target profile.'
            } else {
                Report OK 'IRIS image' 'The qualified Build 154U image is loaded.'
                $target = Read-Docker ($compose + @('ps', '-a', '-q', 'iris'))
                $appRunning = [bool](Read-Docker ($compose + @('ps', '-q', 'app')))
            }
            if (Read-Docker @('image', 'inspect', '--format', '{{.Id}}', $config.services.app.image)) {
                Report OK 'Node image' 'The pinned Compose Node image is loaded.'
            } else {
                Report ACTION 'Node image' "Load the pinned image for offline startup or allow Compose to pull $($config.services.app.image)."
            }
        }
    }
    $installer = Join-Path $PSScriptRoot ".local/zpm-$($ipm.Version).xml"
    $expected = $ipm.InstallerSha256
    if (!(Test-Path -LiteralPath $installer -PathType Leaf)) {
        Report ACTION 'IPM installer' 'Run .\docker\prepare.ps1 to obtain and verify the pinned installer.'
    } elseif ((Get-FileHash -LiteralPath $installer).Hash -ne $expected) {
        Report ACTION 'IPM installer' "The SHA-256 differs from the pinned release. Replace the local XML with the official $($ipm.Version) installer."
    } else {
        Report OK 'IPM installer' "The $($ipm.Version) installer matches its SHA-256."
    }
    if (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.local/compose-credentials.json') -PathType Leaf) {
        Report OK 'Compose secret' 'The local secret file is present.'
    } else {
        Report ACTION 'Compose secret' 'Run .\docker\prepare.ps1 to create the local secret.'
    }
    if ($Apply) {
        if (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.local/apply-operator.txt') -PathType Leaf) {
            Report OK 'Apply operator file' 'The local operator file is present.'
        } else {
            Report ACTION 'Apply operator file' 'Run .\docker\prepare.ps1 -Apply in the isolated checkout.'
        }
    }
}

$liveChecks = 'IRIS build, AI Hub, Interoperability and installed IPM'
if ($target) {
    $details = Read-Docker @('container', 'inspect', '--format', '{{.Id}} {{.Image}} {{.State.Status}} {{index .Config.Labels "dev.isaiah.owner"}}', $target)
    if (!$details) {
        Report ACTION 'IRIS target' 'The selected container could not be inspected.'
    } else {
        $id, $containerImage, $state, $owner = $details -split ' '
        if ($composeMode -and ($containerImage -ne $qualifiedImage -or $owner -ne 'packaging-v010')) {
            Report ACTION 'IRIS target' 'The Compose container does not match the qualified image and project ownership. Check the selected project.'
        } elseif ($state -ne 'running') {
            if ($composeMode) {
                Report DEFERRED 'IRIS target' "Start Compose project '$Project' to check $liveChecks."
            } else {
                Report ACTION 'IRIS target' "Start '$IpmContainer' to check $liveChecks in '$Namespace'."
            }
        } else {
            $probe = @'
set hub=##class(%Dictionary.CompiledClass).%ExistsId("%AI.Agent")&&##class(%Dictionary.CompiledClass).%ExistsId("%AI.Provider")&&##class(%Dictionary.CompiledClass).%ExistsId("%AI.Tool")
set interop=##class(%EnsembleMgr).IsEnsembleNamespace($namespace),ipm=""
if $system.CLS.IsMthd("%IPM.Main","GetIPMVersionInfo") set sc=##class(%IPM.Main).GetIPMVersionInfo(.ipm,.mapped)
write !,"ISAIAH_PREFLIGHT ",{"namespace":($namespace),"build":($ZVERSION),"aiHub":(hub),"interop":(interop),"ipm":(ipm)}.%ToJSON(),!
halt
'@
            $line = $probe | & docker exec -i $id iris session IRIS -U $Namespace 2>$null |
                Where-Object { $_.StartsWith('ISAIAH_PREFLIGHT ') } | Select-Object -Last 1
            $live = if ($line) { $line.Substring('ISAIAH_PREFLIGHT '.Length) | ConvertFrom-Json }
            if (!$live -or $live.namespace -ne $Namespace) {
                Report ACTION 'IRIS session' "Check that instance IRIS is running and namespace '$Namespace' is accessible in the selected container."
            } else {
                if ($live.build -match '2026\.3\.0AI \(Build 154U\)') {
                    Report OK 'IRIS build' "Build 154U in namespace '$Namespace'."
                } else {
                    Report ACTION 'IRIS build' 'The live runtime is different from the qualified Build 154U.'
                }
                if ($live.aiHub) { Report OK 'AI Hub' 'Compiled Agent, Provider and Tool classes are present.' }
                else { Report ACTION 'AI Hub' 'Use a compatible AI Hub build with Agent, Provider and Tool classes.' }
                if ($live.interop) { Report OK Interoperability "Enabled in '$Namespace'." }
                else { Report ACTION Interoperability "Use an approved Interoperability-enabled namespace. '$Namespace' is disabled." }
                if ($live.ipm -eq $ipm.Version) {
                    Report OK IPM "$($ipm.Version) is available in '$Namespace'."
                } else {
                    $found = if ($live.ipm) { "found $($live.ipm)" } else { 'no installation detected' }
                    Report ACTION IPM "Use IPM $($ipm.Version) in '$Namespace' ($found). See the offline IPM bootstrap in the README."
                }
            }
        }
    }
} elseif ($composeMode) {
    Report DEFERRED 'IRIS target' "Start Compose project '$Project' to check $liveChecks."
}

$modelPort = if ($Standalone) { 18758 } elseif ($Apply) { 18752 } elseif ($composeMode) { 18746 } else { 18744 }
$modelCommand = if ($Standalone) { '.\start-model.ps1 -Standalone' } elseif ($Apply) { '.\start-model.ps1 -Apply' } elseif ($composeMode) { '.\start-model.ps1 -Compose' } else { '.\start-model.ps1' }
$modelDigest = '9ba9cc2b4e02463b933096090530aef679d534dd91ecc9afadfb2dbfdc59f3c5'
if ($ProviderProfile) {
    $profileFile = Join-Path $PSScriptRoot '.local/provider-profile.json'
    if (!(Test-Path -LiteralPath $profileFile -PathType Leaf)) {
        Report ACTION 'Provider profile' 'Create the private profile file described in docs/provider-profiles.md.'
    } elseif ($ProviderAuth -and !(Test-Path -LiteralPath (Join-Path $PSScriptRoot '.local/provider-credential.txt') -PathType Leaf)) {
        Report ACTION 'Provider credential' 'Create the separate private provider credential file.'
    } else {
        Report DEFERRED 'Provider profile' 'The running app validates the selected local endpoint and model; no inference requested.'
    }
} else {
try {
    $version = Read-Loopback $modelPort '/api/version'
    $tags = Read-Loopback $modelPort '/api/tags'
    if ($version.version -eq '0.40.6' -and
        ($tags.models | Where-Object { $_.name -eq 'gpt-oss:20b' -and $_.digest -eq $modelDigest })) {
        Report OK 'Model route' "Ollama 0.40.6 on port $modelPort exposes the pinned gpt-oss:20b. No inference requested."
    } else {
        Report ACTION 'Model route' "Use Ollama 0.40.6 with the pinned gpt-oss:20b model on port $modelPort."
    }
} catch {
    Report ACTION 'Model route' "Ollama did not answer its version and model probes on port $modelPort. Start it with $modelCommand."
}
}
if ($appRunning) {
    $app = try { Read-Loopback $(if ($Standalone) { 18757 } else { 18747 }) '/api/state' } catch { $null }
    if ($app.environment.ready) {
        Report OK 'Compose connection' 'The app reports a connected sandbox and model route.'
        if ($Apply -and !$app.environment.applyEnabled) {
            Report ACTION 'Apply gate' 'Check the selected Compose overlay and its operator file.'
        }
        if ($Standalone) {
            $doctor = try { Read-Loopback 18757 '/api/developer/doctor' } catch { $null }
            if ($doctor.ready -and $doctor.agent -and $doctor.edition -eq $Edition) { Report OK 'Developer trace' 'The scoped profile and native AI Hub are reachable.' }
            else { Report ACTION 'Developer trace' 'Check the edition profile and approved read-only adapter.' }
        }
    } else {
        Report ACTION 'Compose connection' "Open http://127.0.0.1:18747/ or check docker compose -p $Project logs iris app for details."
    }
}
if ($hasAction) { exit 1 }
exit 0
