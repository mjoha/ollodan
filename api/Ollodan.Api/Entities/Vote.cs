namespace Ollodan.Api.Entities;

public class Vote
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public Guid MemberId { get; set; }
    public Guid ProductId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Group Group { get; set; } = null!;
    public Member Member { get; set; } = null!;
    public Product Product { get; set; } = null!;
}
