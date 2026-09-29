namespace VgonAgent.Screen;

/// <summary>
/// Length-prefixed framing (4-byte big-endian length + payload) used on the local named pipe
/// between the main service process and the interactive-session capture helper it launches (see
/// <see cref="IInteractiveProcessLauncher"/>). Pure stream operations, independent of
/// NamedPipeStream specifically, so this is unit-testable against a MemoryStream.
///
/// Every await here uses ConfigureAwait(false) — not just style. The helper process
/// (<see cref="ScreenCaptureHelper"/>) calls into this synchronously
/// (<c>.GetAwaiter().GetResult()</c>) from a WinForms Timer.Tick handler running on the UI
/// thread, under a WindowsFormsSynchronizationContext. Without ConfigureAwait(false), the
/// continuation after each internal await would need to resume back on that same UI thread via
/// the message loop — which can't happen, because that thread is the one blocked waiting on
/// GetResult(). That's a deadlock, and it's exactly what happened before this was added: the
/// helper hung forever on its very first frame, with no exception and nothing in any log, until
/// the service's own 10s read timeout gave up and killed it.
/// </summary>
public static class PipeFraming
{
    public static async Task WriteFrameAsync(Stream stream, byte[] payload, CancellationToken ct)
    {
        var header = new byte[4];
        System.Buffers.Binary.BinaryPrimitives.WriteUInt32BigEndian(header, (uint)payload.Length);
        await stream.WriteAsync(header, ct).ConfigureAwait(false);
        if (payload.Length > 0)
        {
            await stream.WriteAsync(payload, ct).ConfigureAwait(false);
        }
        await stream.FlushAsync(ct).ConfigureAwait(false);
    }

    /// <summary>Returns null on a clean end-of-stream before any byte of a new frame arrives
    /// (the writer closed the pipe between frames). Throws EndOfStreamException if the stream
    /// ends mid-frame (a partial header or a truncated payload) — that's a broken connection,
    /// not a normal close.</summary>
    public static async Task<byte[]?> ReadFrameAsync(Stream stream, CancellationToken ct)
    {
        var header = new byte[4];
        var read = await ReadExactOrZeroAsync(stream, header, ct).ConfigureAwait(false);
        if (read == 0) return null;

        var length = (int)System.Buffers.Binary.BinaryPrimitives.ReadUInt32BigEndian(header);
        var payload = new byte[length];
        if (length > 0)
        {
            await ReadExactAsync(stream, payload, ct).ConfigureAwait(false);
        }
        return payload;
    }

    /// <summary>Reads exactly buffer.Length bytes, or 0 if the stream ended before any byte was read.</summary>
    private static async Task<int> ReadExactOrZeroAsync(Stream stream, byte[] buffer, CancellationToken ct)
    {
        var offset = 0;
        while (offset < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(offset, buffer.Length - offset), ct).ConfigureAwait(false);
            if (read == 0)
            {
                if (offset == 0) return 0;
                throw new EndOfStreamException("Stream ended mid-frame");
            }
            offset += read;
        }
        return offset;
    }

    private static async Task ReadExactAsync(Stream stream, byte[] buffer, CancellationToken ct)
    {
        var offset = 0;
        while (offset < buffer.Length)
        {
            var read = await stream.ReadAsync(buffer.AsMemory(offset, buffer.Length - offset), ct).ConfigureAwait(false);
            if (read == 0) throw new EndOfStreamException("Stream ended mid-frame");
            offset += read;
        }
    }
}
