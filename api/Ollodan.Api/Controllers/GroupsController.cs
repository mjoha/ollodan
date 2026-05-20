using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Ollodan.Api.Auth;
using Ollodan.Api.Dtos;
using Ollodan.Api.Entities;
using Ollodan.Api.Services;

namespace Ollodan.Api.Controllers;

[ApiController]
[Route("api/groups")]
public class GroupsController(GroupService groups) : ControllerBase
{
    [HttpPost]
    [EnableRateLimiting("write")]
    public async Task<ActionResult<CreateGroupResponse>> Create([FromBody] CreateGroupRequest request, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(request.Name) || request.Name.Trim().Length > 100)
            return BadRequest(new { error = "Ange ett gruppnamn (max 100 tecken)." });

        var result = await groups.CreateGroupAsync(request.Name, ct);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<ActionResult<GroupDto>> Get(Guid id, CancellationToken ct)
    {
        var group = await groups.GetGroupAsync(id, ct);
        if (group is null)
            return NotFound(new { error = "Gruppen finns inte." });

        return Ok(GroupDtoMapper.ToDto(group));
    }

    [HttpPost("{id:guid}/join")]
    [EnableRateLimiting("write")]
    public async Task<ActionResult<JoinResponse>> Join(Guid id, [FromBody] JoinRequest request, CancellationToken ct)
    {
        var result = await groups.JoinAsync(id, request.DisplayName, ct);
        if (result is null)
            return BadRequest(new { error = "Kunde inte gå med. Gruppen kan vara stängd eller namnet ogiltigt." });

        return Ok(result);
    }

    [HttpPost("{id:guid}/products")]
    [RequireMember]
    [EnableRateLimiting("write")]
    public async Task<ActionResult<ProductDto>> AddProduct(Guid id, [FromBody] AddProductRequest request, CancellationToken ct)
    {
        var member = (Member)HttpContext.Items["Member"]!;
        var product = await groups.AddProductAsync(id, member, request, ct);
        if (product is null)
            return BadRequest(new { error = "Kunde inte lägga till produkt. Kontrollera länken och att gruppen samlar förslag." });

        return Ok(new ProductDto(
            product.Id,
            product.SystembolagetProductId,
            product.Url,
            product.Name,
            product.Price,
            product.ImageUrl,
            product.AddedByMemberId,
            member.DisplayName,
            0));
    }

    [HttpPost("{id:guid}/vote")]
    [RequireMember]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> Vote(Guid id, [FromBody] VoteRequest request, CancellationToken ct)
    {
        var member = (Member)HttpContext.Items["Member"]!;
        var ok = await groups.VoteAsync(id, member, request.ProductId, ct);
        if (!ok)
            return BadRequest(new { error = "Kunde inte rösta. Kontrollera att röstning pågår." });

        return NoContent();
    }

    [HttpPost("{id:guid}/order-lines")]
    [RequireMember]
    [EnableRateLimiting("write")]
    public async Task<IActionResult> SetOrderLine(Guid id, [FromBody] OrderLineRequest request, CancellationToken ct)
    {
        var member = (Member)HttpContext.Items["Member"]!;
        var ok = await groups.SetOrderLineAsync(id, member, request.Quantity, ct);
        if (!ok)
            return BadRequest(new { error = "Kunde inte spara antal." });

        return NoContent();
    }

    [HttpPost("{id:guid}/admin/start-voting")]
    [RequireAdmin]
    public async Task<IActionResult> StartVoting(Guid id, CancellationToken ct)
    {
        var (ok, error) = await groups.StartVotingAsync(id, ct);
        if (!ok) return BadRequest(new { error });
        return NoContent();
    }

    [HttpPost("{id:guid}/admin/finish-voting")]
    [RequireAdmin]
    public async Task<IActionResult> FinishVoting(Guid id, CancellationToken ct)
    {
        var (ok, error, needsTieBreak) = await groups.FinishVotingAsync(id, ct);
        if (!ok)
            return BadRequest(new { error, needsTieBreak });

        return NoContent();
    }

    [HttpPost("{id:guid}/admin/pick-winner")]
    [RequireAdmin]
    public async Task<IActionResult> PickWinner(Guid id, [FromBody] PickWinnerRequest request, CancellationToken ct)
    {
        var (ok, error) = await groups.PickWinnerAsync(id, request.ProductId, ct);
        if (!ok) return BadRequest(new { error });
        return NoContent();
    }

    [HttpPost("{id:guid}/admin/close")]
    [RequireAdmin]
    public async Task<IActionResult> Close(Guid id, CancellationToken ct)
    {
        var (ok, error) = await groups.CloseGroupAsync(id, ct);
        if (!ok) return BadRequest(new { error });
        return NoContent();
    }

    [HttpPut("{id:guid}/admin/swish-note")]
    [RequireAdmin]
    public async Task<IActionResult> SetSwishNote(Guid id, [FromBody] SwishNoteRequest request, CancellationToken ct)
    {
        var ok = await groups.SetSwishNoteAsync(id, request.SwishNote, ct);
        if (!ok) return NotFound(new { error = "Gruppen finns inte." });
        return NoContent();
    }
}
