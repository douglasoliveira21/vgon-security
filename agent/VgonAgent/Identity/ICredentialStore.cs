namespace VgonAgent.Identity;

public interface ICredentialStore
{
    DeviceCredentials? Load();
    void Save(DeviceCredentials credentials);
    void Clear();
}
