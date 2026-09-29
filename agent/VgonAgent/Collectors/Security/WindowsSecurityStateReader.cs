using System.DirectoryServices.AccountManagement;
using System.Management;
using System.Runtime.Versioning;
using Microsoft.Extensions.Logging;
using Microsoft.Win32;
using VgonAgent.Models;

namespace VgonAgent.Collectors.Security;

/// <summary>
/// ISecurityCollector's data source (section 13). Every check is independent and wrapped in its
/// own try/catch: a field left null means "couldn't determine", never a guessed value — the
/// Cloud's rule evaluator (packages/shared) treats unknown as unknown, not as insecure.
///
/// Deliberately NOT implemented: a real "pending critical Windows updates" count needs the
/// Windows Update Agent COM API (IUpdateSearcher.Search()), which can take 10s of seconds and
/// hits Microsoft's update servers — not something to run on a background collector's regular
/// cadence. That field is left null until a dedicated, infrequent (e.g. daily) check is built.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class WindowsSecurityStateReader : ISecurityStateReader
{
    private readonly ILogger _logger;

    public WindowsSecurityStateReader(ILogger logger)
    {
        _logger = logger;
    }

    public SecurityStateData Read() => new()
    {
        WindowsVersion = ReadWindowsVersion(),
        WindowsBuild = ReadRegistryString(RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "CurrentBuildNumber"),
        DefenderEnabled = ReadDefenderEnabled(),
        FirewallEnabled = ReadFirewallEnabled(),
        BitlockerEnabled = ReadBitLockerEnabled(),
        SecureBootEnabled = ReadRegistryBool(RegistryHive.LocalMachine, @"SYSTEM\CurrentControlSet\Control\SecureBoot\State", "UEFISecureBootEnabled"),
        TpmPresent = ReadTpmPresent(),
        UacEnabled = ReadRegistryBool(RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System", "EnableLUA"),
        WindowsUpdatePendingCritical = null, // see class remarks
        LocalAdministrators = ReadLocalAdministrators(),
    };

    private string? ReadWindowsVersion()
    {
        var productName = ReadRegistryString(RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "ProductName");
        var displayVersion = ReadRegistryString(RegistryHive.LocalMachine, @"SOFTWARE\Microsoft\Windows NT\CurrentVersion", "DisplayVersion");
        return string.Join(' ', new[] { productName, displayVersion }.Where(s => !string.IsNullOrWhiteSpace(s)));
    }

    private bool? ReadDefenderEnabled()
    {
        try
        {
            var scope = new ManagementScope(@"root\Microsoft\Windows\Defender");
            scope.Connect();
            using var searcher = new ManagementObjectSearcher(scope, new ObjectQuery("SELECT AntivirusEnabled FROM MSFT_MpComputerStatus"));
            foreach (ManagementBaseObject obj in searcher.Get())
            {
                using (obj)
                {
                    return obj["AntivirusEnabled"] is bool enabled && enabled;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not read Windows Defender status");
        }
        return null;
    }

    private bool? ReadFirewallEnabled()
    {
        // The "Standard" (private/public) profile is the one that applies outside a domain
        // network, the most common case for the endpoints this product targets.
        return ReadRegistryBool(
            RegistryHive.LocalMachine,
            @"SYSTEM\CurrentControlSet\Services\SharedAccess\Parameters\FirewallPolicy\StandardProfile",
            "EnableFirewall");
    }

    private bool? ReadBitLockerEnabled()
    {
        try
        {
            var scope = new ManagementScope(@"root\CIMV2\Security\MicrosoftVolumeEncryption");
            scope.Connect();
            using var searcher = new ManagementObjectSearcher(
                scope, new ObjectQuery("SELECT ProtectionStatus FROM Win32_EncryptableVolume WHERE DriveLetter = 'C:'"));
            foreach (ManagementBaseObject obj in searcher.Get())
            {
                using (obj)
                {
                    // ProtectionStatus: 0 = Unprotected, 1 = Protected, 2 = Unknown.
                    return obj["ProtectionStatus"] is uint status && status == 1;
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not read BitLocker status (often requires elevation)");
        }
        return null;
    }

    private bool? ReadTpmPresent()
    {
        try
        {
            var scope = new ManagementScope(@"root\CIMV2\Security\MicrosoftTpm");
            scope.Connect();
            using var searcher = new ManagementObjectSearcher(scope, new ObjectQuery("SELECT IsEnabled_InitialValue FROM Win32_Tpm"));
            foreach (ManagementBaseObject obj in searcher.Get())
            {
                using (obj)
                {
                    return obj["IsEnabled_InitialValue"] is bool enabled && enabled;
                }
            }
            return false; // namespace connected but no Win32_Tpm instance -> no TPM present
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not read TPM status");
        }
        return null;
    }

    private List<string>? ReadLocalAdministrators()
    {
        try
        {
            using var context = new PrincipalContext(ContextType.Machine);
            using var admins = GroupPrincipal.FindByIdentity(context, "Administrators");
            if (admins is null) return null;

            return admins.GetMembers().Select(m => m.SamAccountName).Where(n => !string.IsNullOrEmpty(n)).ToList()!;
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not enumerate local Administrators group");
            return null;
        }
    }

    private string? ReadRegistryString(RegistryHive hive, string subKeyPath, string valueName)
    {
        try
        {
            using var baseKey = RegistryKey.OpenBaseKey(hive, RegistryView.Registry64);
            using var key = baseKey.OpenSubKey(subKeyPath);
            return key?.GetValue(valueName)?.ToString();
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not read registry value {SubKey}\\{Value}", subKeyPath, valueName);
            return null;
        }
    }

    private bool? ReadRegistryBool(RegistryHive hive, string subKeyPath, string valueName)
    {
        var raw = ReadRegistryString(hive, subKeyPath, valueName);
        return raw is null ? null : raw == "1";
    }
}
