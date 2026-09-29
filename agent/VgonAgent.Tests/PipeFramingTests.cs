using VgonAgent.Screen;

namespace VgonAgent.Tests;

public sealed class PipeFramingTests
{
    [Fact]
    public async Task Round_trips_a_frame_through_a_shared_stream()
    {
        using var stream = new MemoryStream();
        var payload = new byte[] { 1, 2, 3, 4, 5 };

        await PipeFraming.WriteFrameAsync(stream, payload, CancellationToken.None);
        stream.Position = 0;

        var read = await PipeFraming.ReadFrameAsync(stream, CancellationToken.None);

        Assert.Equal(payload, read);
    }

    [Fact]
    public async Task Round_trips_multiple_frames_in_order()
    {
        using var stream = new MemoryStream();
        var frames = new[] { new byte[] { 1 }, new byte[] { 2, 2 }, Array.Empty<byte>(), new byte[] { 4, 4, 4, 4 } };
        foreach (var frame in frames)
        {
            await PipeFraming.WriteFrameAsync(stream, frame, CancellationToken.None);
        }
        stream.Position = 0;

        foreach (var expected in frames)
        {
            var read = await PipeFraming.ReadFrameAsync(stream, CancellationToken.None);
            Assert.Equal(expected, read);
        }
    }

    [Fact]
    public async Task Returns_null_on_a_clean_end_of_stream_between_frames()
    {
        using var stream = new MemoryStream();
        await PipeFraming.WriteFrameAsync(stream, [9], CancellationToken.None);
        stream.Position = 0;

        Assert.NotNull(await PipeFraming.ReadFrameAsync(stream, CancellationToken.None));
        Assert.Null(await PipeFraming.ReadFrameAsync(stream, CancellationToken.None));
    }

    [Fact]
    public async Task Throws_when_the_stream_ends_mid_frame_instead_of_returning_a_truncated_payload()
    {
        using var stream = new MemoryStream();
        await PipeFraming.WriteFrameAsync(stream, new byte[100], CancellationToken.None);
        stream.SetLength(stream.Length - 10); // truncate the last 10 bytes of the payload
        stream.Position = 0;

        await Assert.ThrowsAsync<EndOfStreamException>(() => PipeFraming.ReadFrameAsync(stream, CancellationToken.None));
    }
}
