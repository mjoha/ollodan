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
            .Include(g => g.WinningProduct)
            .FirstOrDefaultAsync(g => g.Id == id, ct);

    public async Task<CreateGroupResponse> CreateGroupAsync(string name, CancellationToken ct = default)
    {
        var group = new Group
        {
            Id = Guid.NewGuid(),
            Name = name.Trim(),
            AdminSecret = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24)),
            Phase = GroupPhase.Collecting
        };

        db.Groups.Add(group);
        await db.SaveChangesAsync(ct);

        return new CreateGroupResponse(group.Id, group.AdminSecret);
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
            ImageUrl = resolved?.ImageUrl,
            AddedByMemberId = member.Id
        };

        db.Products.Add(product);
        await db.SaveChangesAsync(ct);
        return product;
    }

    public async Task<bool> VoteAsync(Guid groupId, Member member, Guid productId, CancellationToken ct = default)
    {
        var group = await db.Groups
            .Include(g => g.Products)
            .Include(g => g.Votes)
            .FirstOrDefaultAsync(g => g.Id == groupId, ct);

        if (group is null || group.Phase != GroupPhase.Voting)
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
            .FirstOrDefaultAsync(g => g.Id == groupId, ct);

        if (group is null || group.Phase != GroupPhase.Ordering)
            return false;

        if (quantity < 0)
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
        if (group.Phase != GroupPhase.Collecting) return (false, "Gruppen är inte i insamlingsfas.");
        if (group.Products.Count == 0) return (false, "Lägg till minst en öl först.");

        group.Phase = GroupPhase.Voting;
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
        if (group.Phase != GroupPhase.Voting) return (false, "Gruppen röstar inte.", false);

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
        if (group.Phase != GroupPhase.Voting) return (false, "Kan bara välja vinnare under röstning.");
        if (!group.Products.Any(p => p.Id == productId)) return (false, "Produkten finns inte i gruppen.");

        group.WinningProductId = productId;
        group.Phase = GroupPhase.Ordering;
        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<(bool Ok, string? Error)> CloseGroupAsync(Guid groupId, CancellationToken ct = default)
    {
        var group = await db.Groups.FindAsync([groupId], ct);
        if (group is null) return (false, "Gruppen finns inte.");
        if (group.Phase != GroupPhase.Ordering) return (false, "Gruppen är inte i beställningsfas.");

        group.Phase = GroupPhase.Closed;
        await db.SaveChangesAsync(ct);
        return (true, null);
    }

    public async Task<bool> SetSwishNoteAsync(Guid groupId, string? note, CancellationToken ct = default)
    {
        var group = await db.Groups.FindAsync([groupId], ct);
        if (group is null) return false;
        group.SwishNote = string.IsNullOrWhiteSpace(note) ? null : note.Trim();
        await db.SaveChangesAsync(ct);
        return true;
    }
}
