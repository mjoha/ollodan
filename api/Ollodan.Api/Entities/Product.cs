namespace Ollodan.Api.Entities;

public class Product
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public string SystembolagetProductId { get; set; } = "";
    public string Url { get; set; } = "";
    public string Name { get; set; } = "";
    public decimal Price { get; set; }
    /// <summary>Minimum store order size (multiples required). From Systembolaget restrictedParcelQuantity or kolli size.</summary>
    public int MinimumOrderQuantity { get; set; } = 1;
    /// <summary>Supplier kolli size when different from minimum (e.g. 24).</summary>
    public int? CaseSize { get; set; }
    public string? ImageUrl { get; set; }
    public Guid? AddedByMemberId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Group Group { get; set; } = null!;
    public Member? AddedByMember { get; set; }
    public ICollection<Vote> Votes { get; set; } = [];
}
