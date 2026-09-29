namespace VgonAgent.Collectors.Printing;

public sealed record PrintJobInfo(
    string JobKey,
    string PrinterName,
    string? DocumentName,
    string? Owner,
    int? Pages,
    long? SizeBytes);

public interface IPrintJobEnumerator
{
    IEnumerable<PrintJobInfo> Enumerate();
}
