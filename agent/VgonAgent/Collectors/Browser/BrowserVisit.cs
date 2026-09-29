namespace VgonAgent.Collectors.Browser;

public sealed record BrowserVisit(string Url, string? Title, DateTimeOffset VisitedAt);

public sealed record ProfileHistoryDatabase(string BrowserName, string ProfilePath, string UserName, string DatabasePath);
