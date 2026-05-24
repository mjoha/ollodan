namespace Ollodan.Api.Entities;

public class Group
{
    public Guid Id { get; set; }
    public string Name { get; set; } = "";
    public GroupPhase Phase { get; set; } = GroupPhase.Collecting;
    public string AdminSecret { get; set; } = "";
    public Guid AdminMemberId { get; set; }
    public bool AllowSuggestions { get; set; } = true;
    public bool IsRepeating { get; set; }
    public string? SwishNote { get; set; }
    public Guid? WinningProductId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Product? WinningProduct { get; set; }
    public ICollection<Member> Members { get; set; } = [];
    public ICollection<Product> Products { get; set; } = [];
    public ICollection<Vote> Votes { get; set; } = [];
    public ICollection<OrderLine> OrderLines { get; set; } = [];
    public ICollection<OrderRound> OrderRounds { get; set; } = [];
}
