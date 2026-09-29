using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using VgonAgent.Configuration;

namespace VgonAgent.Policy;

public sealed class PolicyStore : IPolicyStore
{
    private readonly string _filePath;
    private readonly ILogger<PolicyStore> _logger;
    private readonly object _lock = new();
    private EffectivePolicy _current;

    public PolicyStore(IOptions<AgentOptions> options, ILogger<PolicyStore> logger)
    {
        _logger = logger;
        Directory.CreateDirectory(options.Value.DataDirectory);
        _filePath = Path.Combine(options.Value.DataDirectory, "policy-cache.json");
        _current = LoadFromDisk() ?? new EffectivePolicy();
    }

    public EffectivePolicy Current
    {
        get { lock (_lock) return _current; }
    }

    public void Update(EffectivePolicy policy)
    {
        lock (_lock)
        {
            _current = policy;
        }
        Persist(policy);
    }

    private EffectivePolicy? LoadFromDisk()
    {
        if (!File.Exists(_filePath)) return null;
        try
        {
            var json = File.ReadAllText(_filePath);
            return JsonSerializer.Deserialize<EffectivePolicy>(json);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Could not read cached policy; starting from built-in defaults");
            return null;
        }
    }

    private void Persist(EffectivePolicy policy)
    {
        try
        {
            File.WriteAllText(_filePath, JsonSerializer.Serialize(policy));
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not persist policy cache");
        }
    }
}
