# Publishes the Agent (self-contained, win-x64) and builds the MSI.
# Usage: .\build-msi.ps1 -Version 1.0.5 [-ApiUrl https://api.example.com/api/v1]
# Each version builds into its own bin\<version>\ folder, so a previous MSI that Windows Installer
# still has open (locked) can never block or be mistaken for the new build.
param(
    [string]$Version = "1.0.5",
    [string]$ApiUrl = "https://api.sec.vgon.com.br/api/v1"
)
$ErrorActionPreference = 'Stop'
$here    = $PSScriptRoot
$publish = Join-Path $here 'publish'
$outDir  = Join-Path $here "bin\$Version"
if (Test-Path $publish) { Remove-Item $publish -Recurse -Force }
if (Test-Path $outDir)  { Remove-Item $outDir  -Recurse -Force }

dotnet publish "$here\..\VgonAgent\VgonAgent.csproj" -c Release -r win-x64 --self-contained true `
    -p:Version=$Version -o $publish
if ($LASTEXITCODE) { throw 'publish failed' }

# WiX intermittently fails with MSI error 1631 when the Windows Installer service is busy; retry.
foreach ($attempt in 1..4) {
    dotnet build "$here\VgonAgent.Installer.wixproj" -c Release -p:PublishDir=$publish `
        -p:InstallerVersion=$Version -p:ApiUrl=$ApiUrl -p:OutputPath="$outDir\"
    if (-not $LASTEXITCODE) { break }
    if ($attempt -eq 4) { throw 'msi build failed' }
    Write-Host "MSI build failed (attempt $attempt), retrying in 15s..."
    Start-Sleep 15
}

$built = Get-ChildItem $outDir -Recurse -Filter *.msi | Select-Object -First 1
if (-not $built) { throw "no MSI produced in $outDir" }

$dist = Join-Path $here 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$target = Join-Path $dist "VgonSecurityPlusAgent-$Version.msi"
Copy-Item $built.FullName $target -Force
Write-Host ("MSI: {0} ({1} MB)" -f $target, [math]::Round((Get-Item $target).Length / 1MB, 1))
