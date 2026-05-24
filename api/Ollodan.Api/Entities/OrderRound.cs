namespace Ollodan.Api.Entities;

public class OrderRound
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public int RoundNumber { get; set; }
    public string ProductName { get; set; } = "";
    public string ProductUrl { get; set; } = "";
    public decimal ProductPrice { get; set; }
    public int MinimumOrderQuantity { get; set; }
    public int RequestedTotalQuantity { get; set; }
    public int AdjustedTotalQuantity { get; set; }
    public decimal TotalCost { get; set; }
    public DateTime CompletedAt { get; set; } = DateTime.UtcNow;

    public Group Group { get; set; } = null!;
    public ICollection<OrderRoundLine> Lines { get; set; } = [];
}
