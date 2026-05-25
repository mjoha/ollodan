using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.FileProviders;
using Ollodan.Api.Data;
using Ollodan.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContext<AppDbContext>(options =>
    options.UseSqlite(builder.Configuration.GetConnectionString("Default") ?? "Data Source=ollodan.db"));

builder.Services.AddMemoryCache();
builder.Services.AddHttpClient<SystembolagetClient>(client =>
{
    client.DefaultRequestHeaders.UserAgent.ParseAdd(
        "Mozilla/5.0 (compatible; Ollodan/1.0)");
    client.Timeout = TimeSpan.FromSeconds(15);
});
builder.Services.AddScoped<GroupService>();
builder.Services.AddControllers();

var corsOrigins = builder.Configuration.GetSection("Cors:Origins").Get<string[]>();
if (corsOrigins is { Length: > 0 })
{
    builder.Services.AddCors(options =>
    {
        options.AddDefaultPolicy(policy =>
            policy.WithOrigins(corsOrigins).AllowAnyHeader().AllowAnyMethod());
    });
}

builder.Services.AddRateLimiter(options =>
{
    options.AddFixedWindowLimiter("write", limiter =>
    {
        limiter.PermitLimit = 30;
        limiter.Window = TimeSpan.FromMinutes(1);
        limiter.QueueLimit = 0;
    });
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
});

var app = builder.Build();

if (!app.Environment.IsDevelopment())
{
    app.UseForwardedHeaders(new ForwardedHeadersOptions
    {
        ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto,
    });
}

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    db.Database.Migrate();
}

if (corsOrigins is { Length: > 0 })
    app.UseCors();

app.UseRateLimiter();

app.MapGet("/health", () => Results.Ok(new { status = "ok" }));

app.MapGet("/g/{id:guid}", (Guid id, HttpContext ctx) =>
{
    var key = ctx.Request.Query["key"].FirstOrDefault();
    var target = string.IsNullOrEmpty(key)
        ? $"/group.html?id={id}"
        : $"/group.html?id={id}&key={Uri.EscapeDataString(key)}";
    return Results.Redirect(target);
});

app.MapControllers();
UseStaticFiles(app);
app.Run();

static void UseStaticFiles(WebApplication app)
{
    var wwwroot = Path.Combine(app.Environment.ContentRootPath, "wwwroot");
    if (!Directory.Exists(wwwroot))
    {
        app.Logger.LogWarning(
            "wwwroot missing. Run `npm run build` before starting the app.");
        return;
    }

    var provider = new PhysicalFileProvider(wwwroot);
    app.UseDefaultFiles(new DefaultFilesOptions { FileProvider = provider });
    app.UseStaticFiles(new StaticFileOptions { FileProvider = provider });
}
