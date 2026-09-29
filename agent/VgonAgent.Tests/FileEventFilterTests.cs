using VgonAgent.Collectors.Files;

namespace VgonAgent.Tests;

public sealed class FileEventFilterTests
{
    private static readonly string[] DefaultExcludedExtensions = [".tmp", ".log", ".crdownload"];

    [Theory]
    [InlineData(@"C:\Users\alice\Downloads\report.tmp")]
    [InlineData(@"C:\Users\alice\Downloads\install.crdownload")]
    [InlineData(@"C:\Users\alice\Desktop\debug.LOG")] // extension match is case-insensitive
    public void Ignores_files_with_excluded_extensions(string path)
    {
        Assert.True(FileEventFilter.ShouldIgnore(path, DefaultExcludedExtensions));
    }

    [Fact]
    public void Reports_files_with_extensions_not_on_the_excluded_list()
    {
        Assert.False(FileEventFilter.ShouldIgnore(@"C:\Users\alice\Documents\contract.pdf", DefaultExcludedExtensions));
    }

    [Theory]
    [InlineData(@"C:\Users\alice\Documents\project\node_modules\pkg\index.js")]
    [InlineData(@"C:\Users\alice\Documents\repo\.git\HEAD")]
    public void Ignores_files_under_always_excluded_folders_regardless_of_extension(string path)
    {
        Assert.True(FileEventFilter.ShouldIgnore(path, DefaultExcludedExtensions));
    }

    [Fact]
    public void Does_not_ignore_a_plain_file_with_no_extension()
    {
        Assert.False(FileEventFilter.ShouldIgnore(@"C:\Users\alice\Documents\README", DefaultExcludedExtensions));
    }
}
