using System.Runtime.Versioning;
using Microsoft.Extensions.Logging;
using Microsoft.Win32;
using VgonAgent.Models;

namespace VgonAgent.Collectors.Software;

/// <summary>
/// Reads the standard "Add/Remove Programs" registry locations rather than WMI's Win32_Product,
/// which is notoriously slow and can trigger a repair/reconfigure of every MSI package on the
/// machine just by being queried. Covers machine-wide installs (both 64- and 32-bit views);
/// per-user-profile installs under other users' HKCU hives are not read (would require loading
/// each user's NTUSER.DAT, out of scope for Phase 5).
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class RegistryInstalledSoftwareReader : IInstalledSoftwareReader
{
    private const string UninstallSubKey = @"SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall";
    private readonly ILogger _logger;

    public RegistryInstalledSoftwareReader(ILogger logger)
    {
        _logger = logger;
    }

    public IReadOnlyList<SoftwareItem> Enumerate()
    {
        var items = new Dictionary<string, SoftwareItem>();

        ReadView(RegistryView.Registry64, "x64", items);
        ReadView(RegistryView.Registry32, "x86", items);

        return items.Values.ToList();
    }

    private void ReadView(RegistryView view, string architecture, Dictionary<string, SoftwareItem> items)
    {
        try
        {
            using var baseKey = RegistryKey.OpenBaseKey(RegistryHive.LocalMachine, view);
            using var uninstallKey = baseKey.OpenSubKey(UninstallSubKey);
            if (uninstallKey is null) return;

            foreach (var subKeyName in uninstallKey.GetSubKeyNames())
            {
                try
                {
                    using var entry = uninstallKey.OpenSubKey(subKeyName);
                    if (entry is null) continue;

                    var displayName = entry.GetValue("DisplayName") as string;
                    if (string.IsNullOrWhiteSpace(displayName)) continue;

                    // SystemComponent=1 marks shared runtime bits (VC++ redistributables, .NET
                    // components) rather than something a user would think of as "an app".
                    if (entry.GetValue("SystemComponent") is int systemComponent && systemComponent == 1) continue;

                    var item = new SoftwareItem
                    {
                        Name = displayName,
                        Version = entry.GetValue("DisplayVersion") as string,
                        Publisher = entry.GetValue("Publisher") as string,
                        Architecture = architecture,
                        InstalledAt = ParseInstallDate(entry.GetValue("InstallDate") as string),
                    };

                    // The same product can legitimately appear in both registry views in rare
                    // cases; keep one entry per name+version regardless of which view found it first.
                    items[SoftwareDiffer.Key(item)] = item;
                }
                catch (Exception ex)
                {
                    _logger.LogDebug(ex, "Could not read uninstall entry {SubKey}", subKeyName);
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not open registry view {View}", view);
        }
    }

    // InstallDate is stored as "yyyyMMdd" when present at all.
    private static string? ParseInstallDate(string? raw)
    {
        if (raw is { Length: 8 } &&
            DateTime.TryParseExact(raw, "yyyyMMdd", null, System.Globalization.DateTimeStyles.None, out var date))
        {
            return date.ToString("O");
        }
        return null;
    }
}
