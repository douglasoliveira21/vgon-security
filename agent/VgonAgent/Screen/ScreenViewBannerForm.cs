using System.Runtime.Versioning;
using System.Windows.Forms;

namespace VgonAgent.Screen;

/// <summary>
/// The visible notice shown on the target machine for the entire duration of a live screen-view
/// session (never shown for the silent periodic ScreenshotCollector — see AgentOptions). A plain
/// always-on-top bar rather than a balloon/toast so it can't be dismissed or missed, and stays up
/// for as long as the session runs.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class ScreenViewBannerForm : Form
{
    public ScreenViewBannerForm()
    {
        Text = "VGON Security+";
        FormBorderStyle = FormBorderStyle.None;
        TopMost = true;
        ShowInTaskbar = false;
        StartPosition = FormStartPosition.Manual;
        BackColor = System.Drawing.Color.FromArgb(196, 30, 30);
        Height = 28;
        Width = System.Windows.Forms.Screen.PrimaryScreen?.Bounds.Width ?? 800;
        Location = new System.Drawing.Point(System.Windows.Forms.Screen.PrimaryScreen?.Bounds.X ?? 0, System.Windows.Forms.Screen.PrimaryScreen?.Bounds.Y ?? 0);

        var label = new Label
        {
            Dock = DockStyle.Fill,
            TextAlign = System.Drawing.ContentAlignment.MiddleCenter,
            ForeColor = System.Drawing.Color.White,
            Font = new System.Drawing.Font("Segoe UI", 10, System.Drawing.FontStyle.Bold),
            Text = "Sua tela está sendo visualizada pela equipe de TI · Your screen is being viewed by IT",
        };
        Controls.Add(label);
    }

    // Never take focus/activation away from whatever the user is doing — this is a notice bar,
    // not an interactive window (consistent with "view-only, no input channel" for the feature).
    protected override bool ShowWithoutActivation => true;
}
