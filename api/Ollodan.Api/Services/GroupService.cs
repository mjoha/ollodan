using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Ollodan.Api.Data;
using Ollodan.Api.Dtos;
using Ollodan.Api.Entities;

namespace Ollodan.Api.Services;

public class GroupService(AppDbContext db, SystembolagetClient systembolaget)
{
    public async Task<Group?> GetGroupAsync(Guid id, CancellationToken ct = default) =>
        await db.Groups
            .Include(g => g.Members)
            .Include(g => g.Products).ThenInclude(p => p.AddedByMember)
            .Include(g => g.Votes)
            .Include(g => g.OrderLines).ThenInclude(o => o.Member)
            .Include(g => g.OrderRounds).ThenInclude(r => r.Lines)
            .Include(g => g.WinningProduct)
            .FirstOrDefaultAsync(g => g.Id == id, ct);

    public async Task<CreateGroupResponse?> CreateGroupAsync(
        string name,
        string adminDisplayName,
        bool allowSuggestions = true,
        bool isRepeating = false,
        CancellationToken ct = default)
    {
        var groupName = name.Trim();
        var adminName = adminDisplayName.Trim();
        if (string.IsNullOrWhiteSpace(groupName) || groupName.Length > 100)
            return null;
        if (string.IsNullOrWhiteSpace(adminName) || adminName.Length > 50)
            return null;

        var admin = new Member
        {
            Id = Guid.NewGuid(),
            GroupId = Guid.Empty,
            DisplayName = adminName,
            SessionToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
        };

        var group = new Group
        {
            Id = Guid.NewGuid(),
            Name = groupName,
            AdminSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)),
            AdminMemberId = admin.Id,
            AllowSuggestions = allowSuggestions,
            IsRepeating = isRepeating,
            Phase = GroupPhase.Collecting
        };

        admin.GroupId = group.Id;

        db.Groups.Add(group);
        db.Members.Add(admin);
        await db.SaveChangesAsync(ct);

        return new CreateGroupResponse(
            group.Id,
            group.AdminSecret,
            admin.Id,
            admin.SessionToken,
            admin.DisplayName);
    }

    public async Task<JoinResponse?> JoinAsync(Guid groupId, string displayName, CancellationToken ct = default)
    {
        var group = await db.Groups.FindAsync([groupId], ct);
        if (group is null || group.Phase == GroupPhase.Closed)
            return null;

        var name = displayName.Trim();
        if (string.IsNullOrWhiteSpace(name) || name.Length > 50)
            return null;

        var member = new Member
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            DisplayName = name,
            SessionToken = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
        };

        db.Members.Add(member);
        await db.SaveChangesAsync(ct);

        return new JoinResponse(member.Id, member.SessionToken, member.DisplayName);
    }

    public async Task<Member?> GetMemberByTokenAsync(string token, CancellationToken ct = default) =>
        await db.Members.FirstOrDefaultAsync(m => m.SessionToken == token, ct);

    public async Task<Product?> AddProductAsync(
        Guid groupId,
        Member member,
        AddProductRequest request,
        CancellationToken ct = default)
    {
        var group = await db.Groups
            .Include(g => g.Products)
            .FirstOrDefaultAsync(g => g.Id == groupId, ct);

        if (group is null || group.Phase != GroupPhase.Collecting)
            return null;

        if (!group.AllowSuggestions && member.Id != group.AdminMemberId)
            return null;

        var url = request.Url.Trim();
        var productId = systembolaget.ExtractProductId(url);
        if (productId is null)
            return null;

        if (group.Products.Any(p => p.SystembolagetProductId == productId))
            return group.Products.First(p => p.SystembolagetProductId == productId);

        var resolved = await systembolaget.ResolveAsync(url, ct);
        var name = request.Name?.Trim() ?? resolved?.Name ?? $"Produkt {productId}";
        var price = request.Price ?? resolved?.Price ?? 0;

        var product = new Product
        {
            Id = Guid.NewGuid(),
            GroupId = groupId,
            SystembolagetProductId = productId,
            Url = url,
            Name = name,
            Price = price,
            MinimumOrderQuantity = resolved?.MinimumOrderQuantity ?? 1,
            CaseSize = resolved?.CaseSize,
            ImageUrl = resolved?.ImageUrl,
            AddedByMemberId = member.Id
        };

        db.Products.Add(product);
        await db.SaveChangesAsync(ct);
        return product;
    }

    public async Task<(bool Ok, string? Error)> DeleteProductAsync(
        Guid groupId,
        Guid productId,
        Guid? memberId,
        bool asAdmin,
        CancellationToken ct = default)
    {
        var group = await db.Groups
            .Include(g => g.Products)
            .Include(g => g.Votes)
            .FirstOrDefaultAsync(g => g.Id == groupId, ct);

        if (group is null) return (false, "Gruppen finns inte.");
        if (group.Phase != GroupPhase.Collecting)
            return (false, "Kan bara ta bort öl under insamlingsfasen.");

        var product = group.Products.FirstOrDefault(p => p.Id == productId);
        if (product is null) return (false, "Produkten finns inte.");

        var isGroupAdmin = memberId is not null && memberId == group.AdminMemberId;
        if (!asAdmin && !isGroupAdmin)
        {
            if (memberId is null || product.AddedByMemberId != memberId)
                return (false, "Du kan bara ta bort egna förslag.");
        }

        var votesToRemove = group.Votes.Where(v => v.ProductId == productId).ToList();
        db.Votes.RemoveRange(votesToRemove);
        if (group.WinningProductId == productId)
            group.WinningProductId = null;
        db.Products.Remove(product);
        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<bool> VoteAsync(Guid groupId, Member member, Guid productId, CancellationToken ct = default)
    {
        var group = await db.Groups
            .Include(g => g.Products)
            .Include(g => g.Votes)
            .FirstOrDefaultAsync(g => g.Id == groupId, ct);

        if (group is null)
            return false;

        if (group.Phase != GroupPhase.Voting || !group.AllowSuggestions)
            return false;

        if (!group.Products.Any(p => p.Id == productId))
            return false;

        var existing = group.Votes.FirstOrDefault(v => v.MemberId == member.Id);
        if (existing is not null)
        {
            existing.ProductId = productId;
        }
        else
        {
            db.Votes.Add(new Vote
            {
                Id = Guid.NewGuid(),
                GroupId = groupId,
                MemberId = member.Id,
                ProductId = productId
            });
        }

        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<bool> SetOrderLineAsync(Guid groupId, Member member, int quantity, CancellationToken ct = default)
    {
        var group = await db.Groups
            .Include(g => g.OrderLines)
            .Include(g => g.Votes)
            .FirstOrDefaultAsync(g => g.Id == groupId, ct);

        if (group is null || group.Phase != GroupPhase.Ordering)
            return false;

        if (quantity < 0)
            return false;

        if (group.WinningProductId is null)
            return false;

        var line = group.OrderLines.FirstOrDefault(o => o.MemberId == member.Id);
        if (line is null)
        {
            db.OrderLines.Add(new OrderLine
            {
                Id = Guid.NewGuid(),
                GroupId = groupId,
                MemberId = member.Id,
                Quantity = quantity
            });
        }
        else
        {
            line.Quantity = quantity;
            line.UpdatedAt = DateTime.UtcNow;
        }

        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<(bool Ok, string? Error)> StartVotingAsync(Guid groupId, CancellationToken ct = default)
    {
        var group = await db.Groups.Include(g => g.Products).FirstOrDefaultAsync(g => g.Id == groupId, ct);
        if (group is null) return (false, "Gruppen finns inte.");
        if (!group.AllowSuggestions) return (false, "Den här gruppen använder inte röstning.");
        if (group.Phase != GroupPhase.Collecting) return (false, "Gruppen är inte i insamlingsfas.");
        if (group.Products.Count == 0) return (false, "Lägg till minst en öl först.");

        if (group.Products.Count == 1)
        {
            group.WinningProductId = group.Products.First().Id;
            group.Phase = GroupPhase.Ordering;
        }
        else
        {
            group.Phase = GroupPhase.Voting;
        }

        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<(bool Ok, string? Error)> ConfirmBeerAndStartOrderingAsync(
        Guid groupId,
        Guid productId,
        CancellationToken ct = default)
    {
        var group = await db.Groups.Include(g => g.Products).FirstOrDefaultAsync(g => g.Id == groupId, ct);
        if (group is null) return (false, "Gruppen finns inte.");
        if (group.AllowSuggestions) return (false, "Använd röstning för den här gruppen.");
        if (group.Phase != GroupPhase.Collecting) return (false, "Ölet är redan bekräftat.");
        if (!group.Products.Any(p => p.Id == productId)) return (false, "Välj en öl från listan.");

        group.WinningProductId = productId;
        group.Phase = GroupPhase.Ordering;
        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<(bool Ok, string? Error, bool NeedsTieBreak)> FinishVotingAsync(Guid groupId, CancellationToken ct = default)
    {
        var group = await db.Groups
            .Include(g => g.Products)
            .Include(g => g.Votes)
            .FirstOrDefaultAsync(g => g.Id == groupId, ct);

        if (group is null) return (false, "Gruppen finns inte.", false);
        if (!group.AllowSuggestions) return (false, "Den här gruppen använder inte röstning.", false);
        if (group.Phase != GroupPhase.Voting) return (false, "Gruppen röstar inte.", false);

        if (group.Products.Count == 1)
        {
            group.WinningProductId = group.Products.First().Id;
            group.Phase = GroupPhase.Ordering;
            await db.SaveChangesAsync(ct);
            return (true, null, false);
        }

        var counts = group.Votes
            .GroupBy(v => v.ProductId)
            .Select(g => new { ProductId = g.Key, Count = g.Count() })
            .OrderByDescending(x => x.Count)
            .ToList();

        if (counts.Count == 0)
            return (false, "Ingen har röstat ännu.", false);

        var top = counts[0].Count;
        var leaders = counts.Where(c => c.Count == top).ToList();
        if (leaders.Count > 1)
            return (false, "Oavgjort – välj vinnare manuellt.", true);

        group.WinningProductId = leaders[0].ProductId;
        group.Phase = GroupPhase.Ordering;
        await db.SaveChangesAsync(ct);
        return (true, null, false);
    }

    public async Task<(bool Ok, string? Error)> PickWinnerAsync(Guid groupId, Guid productId, CancellationToken ct = default)
    {
        var group = await db.Groups
            .Include(g => g.Products)
            .FirstOrDefaultAsync(g => g.Id == groupId, ct);

        if (group is null) return (false, "Gruppen finns inte.");
        if (!group.AllowSuggestions) return (false, "Kan inte välja vinnare i den här gruppen.");
        if (group.Phase != GroupPhase.Voting) return (false, "Kan bara välja vinnare under röstning.");
        if (!group.Products.Any(p => p.Id == productId)) return (false, "Produkten finns inte i gruppen.");

        group.WinningProductId = productId;
        group.Phase = GroupPhase.Ordering;
        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<(bool Ok, string? Error)> CloseGroupAsync(Guid groupId, CancellationToken ct = default)
    {
        var group = await db.Groups
            .Include(g => g.Members)
            .Include(g => g.Votes)
            .Include(g => g.OrderLines)
            .Include(g => g.WinningProduct)
            .FirstOrDefaultAsync(g => g.Id == groupId, ct);

        if (group is null) return (false, "Gruppen finns inte.");
        if (group.Phase != GroupPhase.Ordering) return (false, "Gruppen är inte i beställningsfas.");
        if (group.WinningProduct is not { } product)
            return (false, "Ingen öl vald.");

        var requestedTotal = group.OrderLines.Sum(o => o.Quantity);
        var minOrder = product.MinimumOrderQuantity;
        if (requestedTotal <= 0)
            return (false, "Ingen har angett antal.");
        if (requestedTotal < minOrder)
            return (false, $"Minimiantalet {minOrder} st är inte uppnått ({requestedTotal} st önskade).");

        var adjusted = OrderAllocation.Allocate(
            group.OrderLines.Select(o => (o.MemberId, o.Quantity)),
            minOrder);
        var adjustedTotal = adjusted.Values.Sum();
        if (adjustedTotal < minOrder)
            return (false, $"Minimiantalet {minOrder} st är inte uppnått ({requestedTotal} st önskade).");
        if (adjustedTotal % minOrder != 0)
            return (false, "Justerad beställning uppfyller inte minimiantalet.");

        await SaveOrderRoundAsync(group, ct);
        await RemoveCompletedProductAsync(group, product, ct);

        if (group.IsRepeating)
        {
            await ResetForNextRoundAsync(group, ct);
            return (true, null);
        }

        group.Phase = GroupPhase.Closed;
        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<TransferCodeResponse?> CreateTransferCodeAsync(
        Guid groupId,
        Member member,
        CancellationToken ct = default)
    {
        var group = await db.Groups.FindAsync([groupId], ct);
        if (group is null || member.GroupId != groupId || group.Phase == GroupPhase.Closed)
            return null;

        var existing = await db.MemberTransferCodes
            .Where(t => t.MemberId == member.Id)
            .ToListAsync(ct);
        db.MemberTransferCodes.RemoveRange(existing);

        string code;
        var attempts = 0;
        do
        {
            code = TransferCodeGenerator.Generate();
            attempts++;
        } while (
            attempts < 20 &&
            await db.MemberTransferCodes.AnyAsync(t => t.Code == code, ct));

        var expiresAt = DateTime.UtcNow.AddMinutes(5);
        db.MemberTransferCodes.Add(new MemberTransferCode
        {
            Id = Guid.NewGuid(),
            MemberId = member.Id,
            GroupId = groupId,
            Code = code,
            ExpiresAt = expiresAt
        });
        await db.SaveChangesAsync(ct);

        return new TransferCodeResponse(
            TransferCodeGenerator.FormatDisplay(code),
            expiresAt,
            group.Name);
    }

    public async Task<RedeemTransferResponse?> RedeemTransferCodeAsync(string rawCode, CancellationToken ct = default)
    {
        var code = TransferCodeGenerator.Normalize(rawCode);
        if (code.Length != TransferCodeGenerator.Length)
            return null;

        var row = await db.MemberTransferCodes
            .Include(t => t.Member)
            .Include(t => t.Group)
            .FirstOrDefaultAsync(t => t.Code == code, ct);

        if (row is null || row.ExpiresAt <= DateTime.UtcNow)
            return null;

        var member = row.Member;
        var group = row.Group;

        db.MemberTransferCodes.Remove(row);
        await db.SaveChangesAsync(ct);

        return new RedeemTransferResponse(
            group.Id,
            member.Id,
            member.SessionToken,
            member.DisplayName,
            group.Name);
    }

    public async Task<bool> SetSwishNoteAsync(Guid groupId, string? note, CancellationToken ct = default)
    {
        var group = await db.Groups.FindAsync([groupId], ct);
        if (group is null) return false;
        group.SwishNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        await db.SaveChangesAsync(ct);
        return true;
    }

    public async Task<(bool Ok, string? Error)> AdminRevertToPhaseAsync(
        Guid groupId,
        GroupPhase targetPhase,
        CancellationToken ct = default)
    {
        var group = await db.Groups
            .Include(g => g.Products)
            .Include(g => g.Votes)
            .Include(g => g.OrderLines)
            .FirstOrDefaultAsync(g => g.Id == groupId, ct);

        if (group is null) return (false, "Gruppen finns inte.");

        var flow = group.AllowSuggestions
            ? new[] { GroupPhase.Collecting, GroupPhase.Voting, GroupPhase.Ordering, GroupPhase.Closed }
            : new[] { GroupPhase.Collecting, GroupPhase.Ordering, GroupPhase.Closed };

        // Single suggestion skips voting — reverting to "Voting" goes to Collecting instead.
        if (targetPhase == GroupPhase.Voting && group.Products.Count == 1)
            targetPhase = GroupPhase.Collecting;

        var currentIdx = Array.IndexOf(flow, group.Phase);
        var targetIdx = Array.IndexOf(flow, targetPhase);
        if (targetIdx < 0) return (false, "Ogiltig fas.");
        if (targetIdx >= currentIdx) return (false, "Kan bara gå tillbaka till en tidigare fas.");

        if (targetPhase == GroupPhase.Voting && !group.AllowSuggestions)
            return (false, "Den här gruppen har ingen röstningsfas.");

        if (targetPhase == GroupPhase.Ordering && group.WinningProductId is null)
            return (false, "Ingen öl vald — kan inte gå tillbaka till antal.");

        if (targetPhase == GroupPhase.Collecting)
        {
            db.Votes.RemoveRange(group.Votes);
            db.OrderLines.RemoveRange(group.OrderLines);
            group.WinningProductId = null;
            group.Phase = GroupPhase.Collecting;
        }
        else if (targetPhase == GroupPhase.Voting)
        {
            db.OrderLines.RemoveRange(group.OrderLines);
            group.WinningProductId = null;
            group.Phase = GroupPhase.Voting;
        }
        else if (targetPhase == GroupPhase.Ordering)
        {
            group.Phase = GroupPhase.Ordering;
        }

        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    private async Task SaveOrderRoundAsync(Group group, CancellationToken ct)
    {
        if (group.WinningProduct is not { } product)
            return;

        var memberNames = group.Members.ToDictionary(m => m.Id, m => m.DisplayName);
        var rawLines = group.OrderLines.Select(o => (o.MemberId, o.Quantity)).ToList();
        var adjusted = OrderAllocation.Allocate(rawLines, product.MinimumOrderQuantity);

        var lines = group.OrderLines
            .Select(o =>
            {
                var adj = adjusted.GetValueOrDefault(o.MemberId);
                return new OrderRoundLine
                {
                    Id = Guid.NewGuid(),
                    MemberId = o.MemberId,
                    DisplayName = memberNames.GetValueOrDefault(o.MemberId, "?"),
                    Quantity = o.Quantity,
                    AdjustedQuantity = adj,
                    LineTotal = adj * product.Price
                };
            })
            .Where(l => l.Quantity > 0 || l.AdjustedQuantity > 0)
            .ToList();

        if (lines.Count == 0)
            return;

        var roundNumber = await db.OrderRounds.CountAsync(r => r.GroupId == group.Id, ct) + 1;
        var round = new OrderRound
        {
            Id = Guid.NewGuid(),
            GroupId = group.Id,
            RoundNumber = roundNumber,
            ProductName = product.Name,
            ProductUrl = product.Url,
            ProductPrice = product.Price,
            MinimumOrderQuantity = product.MinimumOrderQuantity,
            RequestedTotalQuantity = lines.Sum(l => l.Quantity),
            AdjustedTotalQuantity = lines.Sum(l => l.AdjustedQuantity),
            TotalCost = lines.Sum(l => l.LineTotal),
            CompletedAt = DateTime.UtcNow,
            Lines = lines
        };

        foreach (var line in lines)
            line.OrderRoundId = round.Id;

        db.OrderRounds.Add(round);
        await db.SaveChangesAsync(ct);
    }

    private Task RemoveCompletedProductAsync(Group group, Product product, CancellationToken ct)
    {
        var votesToRemove = group.Votes.Where(v => v.ProductId == product.Id).ToList();
        db.Votes.RemoveRange(votesToRemove);
        group.WinningProductId = null;
        db.Products.Remove(product);
        return Task.CompletedTask;
    }

    private async Task ResetForNextRoundAsync(Group group, CancellationToken ct)
    {
        db.Votes.RemoveRange(group.Votes);
        db.OrderLines.RemoveRange(group.OrderLines);
        group.Votes = [];
        group.OrderLines = [];
        group.WinningProductId = null;
        group.Phase = GroupPhase.Collecting;
        await db.SaveChangesAsync(ct);
    }
}
