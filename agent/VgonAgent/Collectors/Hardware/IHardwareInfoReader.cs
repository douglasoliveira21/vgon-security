using VgonAgent.Models;

namespace VgonAgent.Collectors.Hardware;

public interface IHardwareInfoReader
{
    HardwareInventoryData Read();
}
