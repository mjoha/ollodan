using Ollodan.Api.Entities;
using Ollodan.Api.Services;

namespace Ollodan.Api.Dtos;

public record CreateGroupRequest(
    string Name,
    string AdminDisplayName,
    bool AllowSuggestions = true,
    bool IsRepeating = false);

public record CreateGroupResponse(
    Guid GroupId,
    string AdminSecret,
    Guid MemberId,
    string SessionToken,
    string DisplayName);

public record JoinRequest(string DisplayName);

public record JoinResponse(Guid MemberId, string SessionToken, string DisplayName);

public record AddProductRequest(string Url, string? Name, decimal? Price);

public record VoteRequest(Guid ProductId);

public record OrderLineRequest(int Quantity);

public record PickWinnerRequest(Guid ProductId);

public record SwishNoteRequest(string? SwishNote);

public record RevertPhaseRequest(string Phase);

public record ResolvedProductDto(
    string SystembolagetProductId,
    string Url,
    string Name,
    decimal Price,
    string? ImageUrl,
    int MinimumOrderQuantity,
    int? CaseSize);

public record MemberDto(Guid Id, string DisplayName);

public record ProductDto(
    Guid Id,
    string SystembolagetProductId,
    string Url,
    string Name,
    decimal Price,
    string? ImageUrl,
    int MinimumOrderQuantity,
    int? CaseSize,
    Guid? AddedByMemberId,
    string? AddedByName,
    int VoteCount);

public record VoteDto(Guid MemberId, Guid ProductId);

public record OrderLineDto(
    Guid MemberId,
    string DisplayName,
    int Quantity,
    int AdjustedQuantity,
    decimal LineTotal,
    Guid? ChosenProductId,
    string? ChosenProductName);

public record OrderRoundLineDto(
    string DisplayName,
    int Quantity,
    int AdjustedQuantity,
    decimal LineTotal);

public record OrderRoundDto(
    int RoundNumber,
    DateTime CompletedAt,
    string ProductName,
    string ProductUrl,
    decimal ProductPrice,
    int AdjustedTotalQuantity,
    decimal TotalCost,
    IReadOnlyList<OrderRoundLineDto> Lines);

public record GroupDto(
    Guid Id,
    string Name,
    string Phase,
    bool AllowSuggestions,
    bool IsRepeating,
    Guid AdminMemberId,
    string? SwishNote,
    Guid? WinningProductId,
    ProductDto? WinningProduct,
    IReadOnlyList<MemberDto> Members,
    IReadOnlyList<ProductDto> Products,
    IReadOnlyList<VoteDto> Votes,
    IReadOnlyList<OrderLineDto> OrderLines,
    int MinimumOrderQuantity,
    int? CaseSize,
    int RequestedTotalQuantity,
    int AdjustedTotalQuantity,
    decimal TotalCost,
    int OrderMultiples,
    int RemainderUntilNextMultiple,
    int NextRequestedTarget,
    int RemainderUntilRequestedTarget,
    bool IsOrderFulfilled,
    bool NeedsTieBreak,
    IReadOnlyList<OrderRoundDto> OrderHistory);

public static class GroupDtoMapper
{
    public static GroupDto ToDto(Group group)
    {
        var voteCounts = group.Votes
            .GroupBy(v => v.ProductId)
            .ToDictionary(g => g.Key, g => g.Count());

        var memberNames = group.Members.ToDictionary(m => m.Id, m => m.DisplayName);

        var products = group.Products
            .OrderBy(p => p.CreatedAt)
            .ThenBy(p => p.Name)
            .Select(p => new ProductDto(
                p.Id,
                p.SystembolagetProductId,
                p.Url,
                p.Name,
                p.Price,
                p.ImageUrl,
                p.MinimumOrderQuantity,
                p.CaseSize,
                p.AddedByMemberId,
                p.AddedByMemberId is { } mid ? memberNames.GetValueOrDefault(mid) : null,
                voteCounts.GetValueOrDefault(p.Id)))
            .ToList();

        var minOrder = group.WinningProduct?.MinimumOrderQuantity ?? 1;
        var caseSize = group.WinningProduct?.CaseSize;

        var rawLines = group.OrderLines
            .Select(o => (o.MemberId, o.Quantity))
            .ToList();
        var adjusted = OrderAllocation.Allocate(rawLines, minOrder);

        var price = group.WinningProduct?.Price ?? 0;
        var orderLines = group.OrderLines
            .Select(o => new OrderLineDto(
                o.MemberId,
                memberNames.GetValueOrDefault(o.MemberId, "?"),
                o.Quantity,
                adjusted.GetValueOrDefault(o.MemberId),
                adjusted.GetValueOrDefault(o.MemberId) * price,
                group.WinningProductId,
                group.WinningProduct?.Name))
            .ToList();

        var requestedTotal = orderLines.Sum(o => o.Quantity);
        var adjustedTotal = orderLines.Sum(o => o.AdjustedQuantity);
        var totalCost = orderLines.Sum(o => o.LineTotal);

        var orderMultiples = minOrder > 0 ? adjustedTotal / minOrder : 0;
        var remainderMin = adjustedTotal == 0 ? minOrder : (minOrder - (adjustedTotal % minOrder)) % minOrder;
        var nextRequestedTarget = requestedTotal <= 0
            ? 0
            : ((requestedTotal + minOrder - 1) / minOrder) * minOrder;
        var remainderUntilRequestedTarget = nextRequestedTarget - requestedTotal;
        var isOrderFulfilled = requestedTotal >= minOrder
            && adjustedTotal >= minOrder
            && adjustedTotal % minOrder == 0;

        var needsTieBreak = group.AllowSuggestions
            && group.Phase == GroupPhase.Voting
            && products.Count > 0
            && GetTopVoteCount(products) > 0
            && products.Count(p => p.VoteCount == GetTopVoteCount(products)) > 1;

        ProductDto? winning = null;
        if (group.WinningProduct is { } wp)
        {
            winning = products.FirstOrDefault(p => p.Id == wp.Id)
                ?? new ProductDto(
                    wp.Id,
                    wp.SystembolagetProductId,
                    wp.Url,
                    wp.Name,
                    wp.Price,
                    wp.ImageUrl,
                    wp.MinimumOrderQuantity,
                    wp.CaseSize,
                    wp.AddedByMemberId,
                    null,
                    0);
        }

        return new GroupDto(
            group.Id,
            group.Name,
            group.Phase.ToString(),
            group.AllowSuggestions,
            group.IsRepeating,
            group.AdminMemberId,
            group.SwishNote,
            group.WinningProductId,
            winning,
            group.Members.Select(m => new MemberDto(m.Id, m.DisplayName)).ToList(),
            products,
            group.Votes.Select(v => new VoteDto(v.MemberId, v.ProductId)).ToList(),
            orderLines,
            minOrder,
            caseSize,
            requestedTotal,
            adjustedTotal,
            totalCost,
            orderMultiples,
            remainderMin,
            nextRequestedTarget,
            remainderUntilRequestedTarget,
            isOrderFulfilled,
            needsTieBreak,
            group.OrderRounds
                .OrderByDescending(r => r.RoundNumber)
                .Select(r => new OrderRoundDto(
                    r.RoundNumber,
                    r.CompletedAt,
                    r.ProductName,
                    r.ProductUrl,
                    r.ProductPrice,
                    r.AdjustedTotalQuantity,
                    r.TotalCost,
                    r.Lines
                        .OrderBy(l => l.DisplayName)
                        .Select(l => new OrderRoundLineDto(
                            l.DisplayName,
                            l.Quantity,
                            l.AdjustedQuantity,
                            l.LineTotal))
                        .ToList()))
                .ToList());
    }

    private static int GetTopVoteCount(IReadOnlyList<ProductDto> products) =>
        products.Count == 0 ? 0 : products.Max(p => p.VoteCount);
}
