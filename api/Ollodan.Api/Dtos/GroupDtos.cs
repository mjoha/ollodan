using Ollodan.Api.Entities;

namespace Ollodan.Api.Dtos;

public record CreateGroupRequest(string Name);

public record CreateGroupResponse(Guid GroupId, string AdminSecret);

public record JoinRequest(string DisplayName);

public record JoinResponse(Guid MemberId, string SessionToken, string DisplayName);

public record AddProductRequest(string Url, string? Name, decimal? Price);

public record VoteRequest(Guid ProductId);

public record OrderLineRequest(int Quantity);

public record PickWinnerRequest(Guid ProductId);

public record SwishNoteRequest(string? SwishNote);

public record ResolvedProductDto(
    string SystembolagetProductId,
    string Url,
    string Name,
    decimal Price,
    string? ImageUrl);

public record MemberDto(Guid Id, string DisplayName);

public record ProductDto(
    Guid Id,
    string SystembolagetProductId,
    string Url,
    string Name,
    decimal Price,
    string? ImageUrl,
    Guid? AddedByMemberId,
    string? AddedByName,
    int VoteCount);

public record VoteDto(Guid MemberId, Guid ProductId);

public record OrderLineDto(Guid MemberId, string DisplayName, int Quantity, decimal LineTotal);

public record GroupDto(
    Guid Id,
    string Name,
    string Phase,
    string? SwishNote,
    Guid? WinningProductId,
    ProductDto? WinningProduct,
    IReadOnlyList<MemberDto> Members,
    IReadOnlyList<ProductDto> Products,
    IReadOnlyList<VoteDto> Votes,
    IReadOnlyList<OrderLineDto> OrderLines,
    int TotalQuantity,
    decimal TotalCost,
    int CasesOf24,
    int RemainderUntilNextCase,
    bool NeedsTieBreak);

public static class GroupDtoMapper
{
    public static GroupDto ToDto(Group group)
    {
        var voteCounts = group.Votes
            .GroupBy(v => v.ProductId)
            .ToDictionary(g => g.Key, g => g.Count());

        var memberNames = group.Members.ToDictionary(m => m.Id, m => m.DisplayName);

        var products = group.Products
            .OrderByDescending(p => voteCounts.GetValueOrDefault(p.Id))
            .ThenBy(p => p.Name)
            .Select(p => new ProductDto(
                p.Id,
                p.SystembolagetProductId,
                p.Url,
                p.Name,
                p.Price,
                p.ImageUrl,
                p.AddedByMemberId,
                p.AddedByMemberId is { } mid ? memberNames.GetValueOrDefault(mid) : null,
                voteCounts.GetValueOrDefault(p.Id)))
            .ToList();

        var orderLines = group.OrderLines
            .Select(o =>
            {
                var price = group.WinningProduct?.Price ?? 0;
                return new OrderLineDto(
                    o.MemberId,
                    memberNames.GetValueOrDefault(o.MemberId, "?"),
                    o.Quantity,
                    o.Quantity * price);
            })
            .ToList();

        var totalQty = orderLines.Sum(o => o.Quantity);
        var totalCost = orderLines.Sum(o => o.LineTotal);

        var needsTieBreak = group.Phase == GroupPhase.Voting
            && products.Count > 0
            && GetTopVoteCount(products) > 0
            && products.Count(p => p.VoteCount == GetTopVoteCount(products)) > 1;

        ProductDto? winning = null;
        if (group.WinningProduct is { } wp)
        {
            winning = products.FirstOrDefault(p => p.Id == wp.Id)
                ?? new ProductDto(wp.Id, wp.SystembolagetProductId, wp.Url, wp.Name, wp.Price, wp.ImageUrl, wp.AddedByMemberId, null, 0);
        }

        return new GroupDto(
            group.Id,
            group.Name,
            group.Phase.ToString(),
            group.SwishNote,
            group.WinningProductId,
            winning,
            group.Members.Select(m => new MemberDto(m.Id, m.DisplayName)).ToList(),
            products,
            group.Votes.Select(v => new VoteDto(v.MemberId, v.ProductId)).ToList(),
            orderLines,
            totalQty,
            totalCost,
            totalQty / 24,
            totalQty == 0 ? 24 : (24 - (totalQty % 24)) % 24,
            needsTieBreak);
    }

    private static int GetTopVoteCount(IReadOnlyList<ProductDto> products) =>
        products.Count == 0 ? 0 : products.Max(p => p.VoteCount);
}
