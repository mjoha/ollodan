namespace Ollodan.Api.Services;

/// <summary>
/// Scales member quantities down to the largest multiple of the minimum order
/// that does not exceed the sum of requested quantities.
/// </summary>
public static class OrderAllocation
{
    public static IReadOnlyDictionary<Guid, int> Allocate(
        IEnumerable<(Guid MemberId, int Quantity)> lines,
        int minimumOrderQuantity)
    {
        var min = Math.Max(1, minimumOrderQuantity);
        var list = lines.ToList();
        var result = list.ToDictionary(l => l.MemberId, _ => 0);

        var withQty = list.Where(l => l.Quantity > 0).ToList();
        if (withQty.Count == 0)
            return result;

        var requestedTotal = withQty.Sum(l => l.Quantity);
        var targetTotal = requestedTotal / min * min;
        if (targetTotal < min)
            targetTotal = min;

        var shares = withQty
            .Select(l => (
                l.MemberId,
                Exact: (double)l.Quantity * targetTotal / requestedTotal))
            .Select(s => (
                s.MemberId,
                Base: (int)Math.Floor(s.Exact),
                Remainder: s.Exact - Math.Floor(s.Exact)))
            .ToList();

        var assigned = shares.Sum(s => s.Base);
        var leftover = targetTotal - assigned;

        foreach (var memberId in shares
                     .OrderByDescending(s => s.Remainder)
                     .ThenBy(s => s.MemberId)
                     .Take(leftover)
                     .Select(s => s.MemberId))
        {
            var idx = shares.FindIndex(s => s.MemberId == memberId);
            var s = shares[idx];
            shares[idx] = (s.MemberId, s.Base + 1, s.Remainder);
        }

        foreach (var (memberId, baseQty, _) in shares)
            result[memberId] = baseQty;

        return result;
    }
}
