using VgonAgent.Collectors.Printing;

namespace VgonAgent.Tests;

public sealed class PrintJobNameParserTests
{
    [Fact]
    public void Extracts_the_printer_name_before_the_job_id()
    {
        Assert.Equal("HP LaserJet M404", PrintJobNameParser.ExtractPrinterName("HP LaserJet M404, 42"));
    }

    [Fact]
    public void Handles_a_printer_name_that_itself_contains_a_comma()
    {
        // LastIndexOf(',') ensures only the trailing ", <jobId>" is stripped.
        Assert.Equal("Office, 2nd Floor Printer", PrintJobNameParser.ExtractPrinterName("Office, 2nd Floor Printer, 7"));
    }

    [Fact]
    public void Returns_the_input_unchanged_when_there_is_no_comma()
    {
        Assert.Equal("StandalonePrinter", PrintJobNameParser.ExtractPrinterName("StandalonePrinter"));
    }
}
