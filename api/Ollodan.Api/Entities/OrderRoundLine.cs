namespace Ollodan.Api.Entities;

public class OrderRoundLine
{
    public Guid Id { get; set; }
    public Guid OrderRoundId { get; set; }
    public Guid MemberId { get; set; }
    public string DisplayName { get; set; } = "";
    public int Quantity { get; set; }
    public int AdjustedQuantity { get; set; }
    public decimal LineTotal { get; set; }

    public OrderRound OrderRound { get; set; } = null!;
}
