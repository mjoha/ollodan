namespace Ollodan.Api.Entities;

public class OrderLine
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public Guid MemberId { get; set; }
    public int Quantity { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public Group Group { get; set; } = null!;
    public Member Member { get; set; } = null!;
}
