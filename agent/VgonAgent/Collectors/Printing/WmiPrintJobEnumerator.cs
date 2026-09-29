using System.Management;
using System.Runtime.Versioning;
using Microsoft.Extensions.Logging;

namespace VgonAgent.Collectors.Printing;

[SupportedOSPlatform("windows")]
public sealed class WmiPrintJobEnumerator : IPrintJobEnumerator
{
    private readonly ILogger _logger;

    public WmiPrintJobEnumerator(ILogger logger)
    {
        _logger = logger;
    }

    public IEnumerable<PrintJobInfo> Enumerate()
    {
        var results = new List<PrintJobInfo>();
        try
        {
            using var searcher = new ManagementObjectSearcher(
                "SELECT Name, JobId, Document, Owner, TotalPages, PagesPrinted, Size FROM Win32_PrintJob");

            foreach (ManagementBaseObject obj in searcher.Get())
            {
                using (obj)
                {
                    // Name's key format is "[PrinterName], [JobId]" (Win32_PrintJob's documented key).
                    var name = obj["Name"]?.ToString() ?? string.Empty;
                    var printerName = PrintJobNameParser.ExtractPrinterName(name);
                    var jobId = obj["JobId"]?.ToString() ?? name;

                    var totalPages = ToNullableInt(obj["TotalPages"]);
                    var pagesPrinted = ToNullableInt(obj["PagesPrinted"]);
                    var pages = totalPages is > 0 ? totalPages : pagesPrinted;

                    results.Add(new PrintJobInfo(
                        JobKey: $"{printerName}|{jobId}",
                        PrinterName: printerName,
                        DocumentName: obj["Document"]?.ToString(),
                        Owner: obj["Owner"]?.ToString(),
                        Pages: pages,
                        SizeBytes: ToNullableLong(obj["Size"])));
                }
            }
        }
        catch (Exception ex)
        {
            _logger.LogDebug(ex, "Could not enumerate print jobs");
        }
        return results;
    }

    private static int? ToNullableInt(object? value) => int.TryParse(value?.ToString(), out var i) ? i : null;
    private static long? ToNullableLong(object? value) => long.TryParse(value?.ToString(), out var l) ? l : null;
}
