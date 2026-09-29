namespace VgonAgent.Update;

/// <summary>
/// Generates the PowerShell script that performs the actual swap (section 24: "install").
/// A running .exe can't overwrite its own file, so — like most self-updating Windows services —
/// the swap happens in a short-lived detached process while the service is stopped, not inline
/// in the Agent process itself. Pure string-building, so the exact command sequence is unit
/// tested without ever actually stopping a service.
/// </summary>
public static class UpdateScriptBuilder
{
    public static string Build(string serviceName, string installDir, string stagedZipPath, string backupDir)
    {
        // Every step after Stop-Service is wrapped so a failure triggers the restore-from-backup
        // path (section 24: "rollback") instead of leaving the service stopped on a half-applied update.
        return $$"""
            $ErrorActionPreference = 'Stop'
            $serviceName = '{{serviceName}}'
            $installDir = '{{installDir}}'
            $stagedZip = '{{stagedZipPath}}'
            $backupDir = '{{backupDir}}'

            Write-Host "Stopping $serviceName..."
            Stop-Service -Name $serviceName -Force

            try {
                Write-Host "Backing up current install to $backupDir..."
                New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
                Copy-Item -Path "$installDir\*" -Destination $backupDir -Recurse -Force

                Write-Host "Applying update from $stagedZip..."
                Expand-Archive -Path $stagedZip -DestinationPath $installDir -Force

                Write-Host "Starting $serviceName..."
                Start-Service -Name $serviceName

                Start-Sleep -Seconds 5
                $svc = Get-Service -Name $serviceName
                if ($svc.Status -ne 'Running') {
                    throw "Service did not reach Running state after update"
                }

                Write-Host "Update applied successfully."
            }
            catch {
                Write-Warning "Update failed: $_. Rolling back to backup..."
                Stop-Service -Name $serviceName -Force -ErrorAction SilentlyContinue
                Copy-Item -Path "$backupDir\*" -Destination $installDir -Recurse -Force
                Start-Service -Name $serviceName
                throw
            }
            """;
    }
}
