namespace Ollodan.Api.Entities;

public class Product
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public string SystembolagetProductId { get; set; } = "";
    public string Url { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    public string? ImageUrl { get; set; }
    public Guid? AddedByMemberId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Group Group { get; set; } = null!;
    public Member? AddedByMember { get; set; }
    public ICollection<Vote> Votes { get; set; } = [];
}
