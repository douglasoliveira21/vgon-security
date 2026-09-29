using System.Text;
using VgonAgent.Update;

namespace VgonAgent.Tests;

public sealed class UpdatePackageVerifierTests
{
    [Fact]
    public void Computes_the_correct_known_sha256_digest()
    {
        // sha256("hello world") is a well-known test vector.
        var hash = UpdatePackageVerifier.ComputeSha256(Encoding.UTF8.GetBytes("hello world"));

        Assert.Equal("b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9", hash);
    }

    [Fact]
    public void Verification_succeeds_when_the_hash_matches()
    {
        var content = Encoding.UTF8.GetBytes("release package contents");
        var hash = UpdatePackageVerifier.ComputeSha256(content);

        Assert.True(UpdatePackageVerifier.VerifySha256(content, hash));
    }

    [Fact]
    public void Verification_fails_on_a_single_byte_of_tampering()
    {
        var original = Encoding.UTF8.GetBytes("release package contents");
        var expectedHash = UpdatePackageVerifier.ComputeSha256(original);

        var tampered = Encoding.UTF8.GetBytes("Release package contents"); // one char differs

        Assert.False(UpdatePackageVerifier.VerifySha256(tampered, expectedHash));
    }

    [Fact]
    public void Verification_is_case_insensitive_on_the_expected_hash()
    {
        var content = Encoding.UTF8.GetBytes("content");
        var hash = UpdatePackageVerifier.ComputeSha256(content);

        Assert.True(UpdatePackageVerifier.VerifySha256(content, hash.ToUpperInvariant()));
    }
}
