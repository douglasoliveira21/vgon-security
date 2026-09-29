using System.Runtime.Versioning;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;

namespace VgonAgent.Identity;

/// <summary>
/// Persists the device's refresh token encrypted at rest with Windows DPAPI
/// (section 4: "nunca gravar credenciais em texto puro em arquivos comuns").
/// LocalMachine scope is used because the Agent runs as a Windows Service (typically
/// LocalSystem), not as an interactive user — CurrentUser scope would not round-trip.
/// </summary>
[SupportedOSPlatform("windows")]
public sealed class DpapiCredentialStore : ICredentialStore
{
    private readonly string _filePath;
    // Ties the encrypted blob to this purpose so it can't be decrypted if repurposed elsewhere on the machine.
    private static readonly byte[] Entropy = "vgon-security-plus-agent-credentials-v1"u8.ToArray();

    public DpapiCredentialStore(IOptions<AgentOptions> options)
    {
        Directory.CreateDirectory(options.Value.DataDirectory);
        _filePath = Path.Combine(options.Value.DataDirectory, "credentials.bin");
    }

    public DeviceCredentials? Load()
    {
        if (!File.Exists(_filePath)) return null;

        var encrypted = File.ReadAllBytes(_filePath);
        var plaintext = ProtectedData.Unprotect(encrypted, Entropy, DataProtectionScope.LocalMachine);
        return JsonSerializer.Deserialize<DeviceCredentials>(plaintext);
    }

    public void Save(DeviceCredentials credentials)
    {
        var plaintext = JsonSerializer.SerializeToUtf8Bytes(credentials);
        var encrypted = ProtectedData.Protect(plaintext, Entropy, DataProtectionScope.LocalMachine);
        File.WriteAllBytes(_filePath, encrypted);
    }

    public void Clear()
    {
        if (File.Exists(_filePath)) File.Delete(_filePath);
    }
}
