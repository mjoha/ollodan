namespace Ollodan.Api.Entities;

public class MemberTransferCode
{
    public Guid Id { get; set; }
    public Guid MemberId { get; set; }
    public Guid GroupId { get; set; }
    public string Code { get; set; } = "";
    public DateTime ExpiresAt { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Member Member { get; set; } = null!;
    public Group Group { get; set; } = null!;
}
