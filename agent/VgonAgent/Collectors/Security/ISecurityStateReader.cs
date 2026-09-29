using VgonAgent.Models;

namespace VgonAgent.Collectors.Security;

public interface ISecurityStateReader
{
    SecurityStateData Read();
}
