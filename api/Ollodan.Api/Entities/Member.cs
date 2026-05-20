namespace Ollodan.Api.Entities;

public class Member
{
    public Guid Id { get; set; }
    public Guid GroupId { get; set; }
    public string DisplayName { get; set; } = "";
    public string SessionToken { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Group Group { get; set; } = null!;
    public ICollection<Vote> Votes { get; set; } = [];
    public OrderLine? OrderLine { get; set; }
}
