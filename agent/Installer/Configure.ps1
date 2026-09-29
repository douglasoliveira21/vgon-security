param(
    [Parameter(Mandatory)][string]$InstallDir,
    [string]$ApiUrl,
    [string]$Token
)
# Writes appsettings.Production.json next to the Agent. Runs elevated during MSI install.
$ErrorActionPreference = 'Stop'
if (-not $ApiUrl -and -not $Token) { exit 0 }

$agent = [ordered]@{}
if ($ApiUrl) { $agent.ApiBaseUrl = $ApiUrl.TrimEnd('/') }
if ($Token)  { $agent.ProvisioningToken = $Token }

$path = Join-Path $InstallDir 'appsettings.Production.json'
@{ Agent = $agent } | ConvertTo-Json -Depth 5 | Set-Content -Path $path -Encoding UTF8
