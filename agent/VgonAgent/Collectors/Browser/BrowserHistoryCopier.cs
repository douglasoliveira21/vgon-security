using Microsoft.Extensions.Logging;

namespace VgonAgent.Collectors.Browser;

/// <summary>
/// Browsers keep their history database open (often in WAL mode) while running. Copying it to a
/// temp file first — rather than opening the live file read-only — avoids "database is locked"
/// failures and never risks interfering with the browser's own writes.
/// </summary>
public static class BrowserHistoryCopier
{
    public static string? CopyLocked(string sourcePath, string tempDirectory, ILogger logger)
    {
        try
        {
            Directory.CreateDirectory(tempDirectory);
            var destination = Path.Combine(tempDirectory, $"{Guid.NewGuid():N}.sqlite");

            using (var source = new FileStream(sourcePath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite | FileShare.Delete))
            using (var dest = new FileStream(destination, FileMode.CreateNew, FileAccess.Write))
            {
                source.CopyTo(dest);
            }

            // Best-effort: also copy the WAL sidecar so very recent visits (not yet checkpointed
            // into the main file) are included. Its absence is normal and not an error.
            var walSource = sourcePath + "-wal";
            if (File.Exists(walSource))
            {
                try
                {
                    File.Copy(walSource, destination + "-wal", overwrite: true);
                }
                catch
                {
                    // Non-fatal — the reader still gets everything already checkpointed.
                }
            }

            return destination;
        }
        catch (Exception ex)
        {
            logger.LogDebug(ex, "Could not snapshot browser history file {Path}", sourcePath);
            return null;
        }
    }

    public static void TryDelete(string path)
    {
        try { File.Delete(path); } catch { /* best-effort cleanup */ }
        try { File.Delete(path + "-wal"); } catch { /* best-effort cleanup */ }
        try { File.Delete(path + "-shm"); } catch { /* best-effort cleanup */ }
    }
}
