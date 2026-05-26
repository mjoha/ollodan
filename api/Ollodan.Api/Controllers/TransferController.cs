using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.RateLimiting;
using Ollodan.Api.Dtos;
using Ollodan.Api.Services;

namespace Ollodan.Api.Controllers;

[ApiController]
[Route("api/transfer")]
public class TransferController(GroupService groups) : ControllerBase
{
    [HttpPost("redeem")]
    [EnableRateLimiting("redeem")]
    public async Task<ActionResult<RedeemTransferResponse>> Redeem(
        [FromBody] RedeemTransferRequest request,
        CancellationToken ct)
    {
        var result = await groups.RedeemTransferCodeAsync(request.Code, ct);
        if (result is null)
            return BadRequest(new { error = "Ogiltig eller utgången kod." });

        return Ok(result);
    }
}
