using System.Net;
using System.Text.RegularExpressions;
using Microsoft.Extensions.Caching.Memory;
using Ollodan.Api.Dtos;

namespace Ollodan.Api.Services;

public partial class SystembolagetClient(HttpClient http, IMemoryCache cache, ILogger<SystembolagetClient> logger)
{
    public string? ExtractProductId(string url)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri))
            return null;

        if (!uri.Host.Contains("systembolaget", StringComparison.OrdinalIgnoreCase))
            return null;

        var segments = uri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
        var produktIdx = Array.FindIndex(
            segments,
            s => s.Equals("produkt", StringComparison.OrdinalIgnoreCase));

        if (produktIdx >= 0)
        {
            for (var i = segments.Length - 1; i > produktIdx; i--)
            {
                var id = ExtractIdFromSegment(segments[i]);
                if (id is not null)
                    return id;
            }
        }

        var match = ProductIdPattern().Match(uri.AbsolutePath);
        return match.Success ? match.Groups[1].Value : null;
    }

    public async Task<ResolvedProductDto?> ResolveAsync(string url, CancellationToken ct = default)
    {
        var productId = ExtractProductId(url);
        if (productId is null)
            return null;

        var cacheKey = $"sb:{productId}";
        if (cache.TryGetValue(cacheKey, out ResolvedProductDto? cached))
            return cached;

        var resolved = await FetchFromHtmlAsync(productId, url, ct);
        if (resolved is not null)
            cache.Set(cacheKey, resolved, TimeSpan.FromHours(24));

        return resolved;
    }

    private async Task<ResolvedProductDto?> FetchFromHtmlAsync(string productId, string url, CancellationToken ct)
    {
        try
        {
            var response = await http.GetAsync(url, ct);
            if (!response.IsSuccessStatusCode)
                return null;

            var html = await response.Content.ReadAsStringAsync(ct);

            var name = OgMetaRegex().Match(html) is { Success: true } og
                ? WebUtility.HtmlDecode(og.Groups[1].Value)
                : null;

            var image = OgImageRegex().Match(html) is { Success: true } img
                ? img.Groups[1].Value
                : null;

            var price = ParsePriceFromHtml(html);

            if (string.IsNullOrWhiteSpace(name) && price is null)
                return null;

            return new ResolvedProductDto(
                productId,
                url,
                string.IsNullOrWhiteSpace(name) ? $"Produkt {productId}" : name.Trim(),
                price ?? 0,
                image);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to resolve product {ProductId}", productId);
            return null;
        }
    }

    private static string? ExtractIdFromSegment(string segment)
    {
        if (Regex.IsMatch(segment, @"^\d+$"))
            return segment;

        var slug = SlugProductIdRegex().Match(segment);
        return slug.Success ? slug.Groups[1].Value : null;
    }

    private static decimal? ParsePriceFromHtml(string html)
    {
        var colon = PriceColonRegex().Match(html);
        if (colon.Success)
        {
            var p = decimal.Parse($"{colon.Groups[1].Value}.{colon.Groups[2].Value}",
                System.Globalization.CultureInfo.InvariantCulture);
            if (p is > 0 and < 100_000)
                return p;
        }

        foreach (Match m in PriceKrRegex().Matches(html))
        {
            var whole = m.Groups[1].Value;
            var frac = m.Groups[2].Success ? m.Groups[2].Value : "0";
            var raw = frac.Length > 0 ? $"{whole}.{frac}" : whole;
            if (decimal.TryParse(raw, System.Globalization.NumberStyles.Any,
                    System.Globalization.CultureInfo.InvariantCulture, out var p) &&
                p is > 0 and < 100_000)
                return p;
        }

        return null;
    }

    [GeneratedRegex(@"/produkt(?:/[^/]+)*/(\d+)", RegexOptions.IgnoreCase)]
    private static partial Regex ProductIdPattern();

    [GeneratedRegex(@"-(\d+)$", RegexOptions.IgnoreCase)]
    private static partial Regex SlugProductIdRegex();

    [GeneratedRegex(@"property=""og:title""\s+content=""([^""]+)""", RegexOptions.IgnoreCase)]
    private static partial Regex OgMetaRegex();

    [GeneratedRegex(@"property=""og:image""\s+content=""([^""]+)""", RegexOptions.IgnoreCase)]
    private static partial Regex OgImageRegex();

    [GeneratedRegex(@"(\d{1,4}):(\d{2})")]
    private static partial Regex PriceColonRegex();

    [GeneratedRegex(@"(\d{1,4})(?:[,.](\d{2}))?\s*kr(?!\s*/)", RegexOptions.IgnoreCase)]
    private static partial Regex PriceKrRegex();
}
