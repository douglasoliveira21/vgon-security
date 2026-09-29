namespace VgonAgent.Collectors.Printing;

/// <summary>Win32_PrintJob's key `Name` property is formatted "[PrinterName], [JobId]" — pure
/// parsing extracted for testability, separate from the WMI query that produces it.</summary>
public static class PrintJobNameParser
{
    public static string ExtractPrinterName(string name) =>
        name.Contains(',') ? name[..name.LastIndexOf(',')].Trim() : name;
}
