using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;
using Ollodan.Api.Services;

namespace Ollodan.Api.Auth;

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequireMemberAttribute : Attribute, IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var services = context.HttpContext.RequestServices;
        var groupService = services.GetRequiredService<GroupService>();

        if (!context.HttpContext.Request.Headers.TryGetValue("Authorization", out var auth) ||
            !auth.ToString().StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
        {
            context.Result = new UnauthorizedObjectResult(new { error = "Logga in med ditt namn först." });
            return;
        }

        var token = auth.ToString()["Bearer ".Length..].Trim();
        var member = await groupService.GetMemberByTokenAsync(token);
        if (member is null)
        {
            context.Result = new UnauthorizedObjectResult(new { error = "Ogiltig session." });
            return;
        }

        if (context.RouteData.Values.TryGetValue("id", out var idObj) &&
            Guid.TryParse(idObj?.ToString(), out var groupId) &&
            member.GroupId != groupId)
        {
            context.Result = new ForbidResult();
            return;
        }

        context.HttpContext.Items["Member"] = member;
        await next();
    }
}

[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method)]
public class RequireAdminAttribute : Attribute, IAsyncActionFilter
{
    public async Task OnActionExecutionAsync(ActionExecutingContext context, ActionExecutionDelegate next)
    {
        var db = context.HttpContext.RequestServices.GetRequiredService<Data.AppDbContext>();

        if (!context.RouteData.Values.TryGetValue("id", out var idObj) ||
            !Guid.TryParse(idObj?.ToString(), out var groupId))
        {
            context.Result = new BadRequestObjectResult(new { error = "Ogiltigt grupp-id." });
            return;
        }

        if (!context.HttpContext.Request.Headers.TryGetValue("X-Admin-Key", out var key) ||
            string.IsNullOrWhiteSpace(key))
        {
            context.Result = new UnauthorizedObjectResult(new { error = "Admin-nyckel saknas." });
            return;
        }

        var group = await db.Groups.FindAsync(groupId);
        if (group is null || group.AdminSecret != key.ToString())
        {
            context.Result = new UnauthorizedObjectResult(new { error = "Ogiltig admin-nyckel." });
            return;
        }

        context.HttpContext.Items["Group"] = group;
        await next();
    }
}
