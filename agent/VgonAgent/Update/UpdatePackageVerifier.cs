using System.Security.Cryptography;

namespace VgonAgent.Update;

/// <summary>
/// Section 24: "verificar autenticidade/integridade" / "nunca instalar um binário sem verificar".
/// A SHA-256 match against the hash the Cloud published alongside the download URL is the
/// integrity check — the download and the "what hash to expect" both come from the same
/// authenticated, TLS-protected API call, so a tampered download (MITM'd file, wrong file left
/// on the CDN, partial download) is caught before anything touches the installed binaries.
/// </summary>
public static class UpdatePackageVerifier
{
    public static string ComputeSha256(byte[] content) =>
        Convert.ToHexString(SHA256.HashData(content)).ToLowerInvariant();

    public static bool VerifySha256(byte[] content, string expectedHexHash) =>
        string.Equals(ComputeSha256(content), expectedHexHash.Trim(), StringComparison.OrdinalIgnoreCase);
}
