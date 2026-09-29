using VgonAgent.Models;

namespace VgonAgent.Collectors.Software;

public interface IInstalledSoftwareReader
{
    IReadOnlyList<SoftwareItem> Enumerate();
}
