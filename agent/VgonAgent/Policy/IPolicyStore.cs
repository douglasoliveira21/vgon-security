namespace VgonAgent.Policy;

public interface IPolicyStore
{
    /// <summary>The last known-good effective policy — either just-fetched, or the cached one
    /// from disk if the Cloud has been unreachable (section 16: "continuar aplicando a última
    /// política válida"). Never null: an all-defaults-null EffectivePolicy is used before the
    /// very first successful fetch, which every collector already treats as "use my own default".</summary>
    EffectivePolicy Current { get; }

    void Update(EffectivePolicy policy);
}
