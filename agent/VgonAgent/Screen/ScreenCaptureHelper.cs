using System.Drawing;
using System.Drawing.Imaging;
using System.IO.Pipes;
using System.Runtime.InteropServices;
using System.Runtime.Versioning;
using System.Windows.Forms;

namespace VgonAgent.Screen;

/// <summary>
/// Entry points run inside the short-lived helper process the main service launches into the
/// active interactive session (see <see cref="IInteractiveProcessLauncher"/>) — never inside the
/// service process itself, which has no desktop to capture. Dispatched from Program.cs's
/// top-level argument check, before the normal Worker host is built.
/// </summary>
[SupportedOSPlatform("windows")]
public static class ScreenCaptureHelper
{
    /// <summary>`VgonAgent.exe --capture-once &lt;outputPath&gt;` — one silent capture, saved to
    /// <paramref name="outputPath"/>, then exits. Used by ScreenshotCollector.</summary>
    public static int RunCaptureOnce(string outputPath)
    {
        TrySetDpiAwareness();
        try
        {
            var (bytes, _, _) = CaptureJpeg(maxWidth: 1600, quality: 60);
            File.WriteAllBytes(outputPath, bytes);
            return 0;
        }
        catch (Exception ex)
        {
            ScreenDiagnostics.Log("[helper] capture-once failed", ex);
            return 2;
        }
    }

    /// <summary>`VgonAgent.exe --live-view &lt;pipeName&gt; &lt;intervalMs&gt;` — connects to the
    /// service's named pipe, shows the on-screen notice banner, and repeatedly captures + writes
    /// frames until the pipe breaks (service stopped the session) or this process is killed (the
    /// service does that directly once the Cloud says to stop or the max duration is hit).</summary>
    public static int RunLiveView(string pipeName, int intervalMs)
    {
        ScreenDiagnostics.Log($"[helper] starting, pipe={pipeName}, intervalMs={intervalMs}, pid={Environment.ProcessId}, user={Environment.UserName}");
        TrySetDpiAwareness();

        // WinForms (the banner + its message pump) needs a genuine STA thread — top-level
        // Program.cs's own Main thread apartment state isn't guaranteed, so this is spun up
        // explicitly rather than relying on it.
        var exitCode = 0;
        var thread = new Thread(() =>
        {
            NamedPipeClientStream? pipe = null;
            try
            {
                pipe = new NamedPipeClientStream(".", pipeName, PipeDirection.Out);
                pipe.Connect(10_000);
                ScreenDiagnostics.Log("[helper] pipe connected");
            }
            catch (Exception ex)
            {
                ScreenDiagnostics.Log("[helper] pipe.Connect failed", ex);
                exitCode = 1;
                return;
            }

            var frameCount = 0;
            using var banner = new ScreenViewBannerForm();
            using var timer = new System.Windows.Forms.Timer { Interval = Math.Max(intervalMs, 250) };
            timer.Tick += (_, _) =>
            {
                try
                {
                    var (bytes, w, h) = CaptureJpeg(maxWidth: 1280, quality: 45);
                    PipeFraming.WriteFrameAsync(pipe, bytes, CancellationToken.None).GetAwaiter().GetResult();
                    frameCount++;
                    if (frameCount == 1 || frameCount % 10 == 0)
                    {
                        ScreenDiagnostics.Log($"[helper] wrote frame #{frameCount} ({bytes.Length} bytes, {w}x{h})");
                    }
                }
                catch (Exception ex)
                {
                    ScreenDiagnostics.Log($"[helper] capture/write failed on frame #{frameCount + 1}; stopping", ex);
                    timer.Stop();
                    Application.Exit();
                }
            };

            banner.Show();
            timer.Start();
            ScreenDiagnostics.Log("[helper] banner shown, timer started, entering message loop");
            Application.Run();
            ScreenDiagnostics.Log($"[helper] message loop exited after {frameCount} frame(s)");
            pipe.Dispose();
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        thread.Join();
        ScreenDiagnostics.Log($"[helper] exiting with code {exitCode}");
        return exitCode;
    }

    private static (byte[] Bytes, int Width, int Height) CaptureJpeg(int maxWidth, int quality)
    {
        var bounds = SystemInformation.VirtualScreen; // covers every monitor, not just the primary one
        using var full = new Bitmap(bounds.Width, bounds.Height, PixelFormat.Format24bppRgb);
        using (var g = Graphics.FromImage(full))
        {
            g.CopyFromScreen(bounds.Location, Point.Empty, bounds.Size, CopyPixelOperation.SourceCopy);
        }

        Bitmap toEncode = full;
        var resized = false;
        if (full.Width > maxWidth)
        {
            var scale = (double)maxWidth / full.Width;
            toEncode = new Bitmap(full, new Size(maxWidth, Math.Max(1, (int)(full.Height * scale))));
            resized = true;
        }

        try
        {
            using var ms = new MemoryStream();
            var jpegCodec = ImageCodecInfo.GetImageEncoders().First(c => c.FormatID == ImageFormat.Jpeg.Guid);
            using var encoderParams = new EncoderParameters(1);
            encoderParams.Param[0] = new EncoderParameter(Encoder.Quality, (long)quality);
            toEncode.Save(ms, jpegCodec, encoderParams);
            return (ms.ToArray(), toEncode.Width, toEncode.Height);
        }
        finally
        {
            if (resized) toEncode.Dispose();
        }
    }

    private static readonly IntPtr DpiAwarenessContextPerMonitorAwareV2 = new(-4);

    private static void TrySetDpiAwareness()
    {
        // Not supported on older Windows builds — a blurry/incorrectly-scaled capture there is a
        // cosmetic issue, not a functional one, so a failure here is deliberately swallowed.
        try { SetProcessDpiAwarenessContext(DpiAwarenessContextPerMonitorAwareV2); } catch { /* best-effort */ }
    }

    [DllImport("user32.dll")]
    private static extern bool SetProcessDpiAwarenessContext(IntPtr value);
}
