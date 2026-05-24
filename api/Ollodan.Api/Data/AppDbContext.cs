using Microsoft.EntityFrameworkCore;
using Ollodan.Api.Entities;

namespace Ollodan.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Group> Groups => Set<Group>();
    public DbSet<Member> Members => Set<Member>();
    public DbSet<Product> Products => Set<Product>();
    public DbSet<Vote> Votes => Set<Vote>();
    public DbSet<OrderLine> OrderLines => Set<OrderLine>();
    public DbSet<OrderRound> OrderRounds => Set<OrderRound>();
    public DbSet<OrderRoundLine> OrderRoundLines => Set<OrderRoundLine>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Group>(e =>
        {
            e.HasKey(g => g.Id);
            e.HasIndex(g => g.AdminSecret);
            e.HasOne(g => g.WinningProduct)
                .WithMany()
                .HasForeignKey(g => g.WinningProductId)
                .OnDelete(DeleteBehavior.SetNull);
        });

        modelBuilder.Entity<Member>(e =>
        {
            e.HasKey(m => m.Id);
            e.HasIndex(m => m.SessionToken).IsUnique();
            e.HasOne(m => m.Group).WithMany(g => g.Members).HasForeignKey(m => m.GroupId);
        });

        modelBuilder.Entity<Product>(e =>
        {
            e.HasKey(p => p.Id);
            e.HasIndex(p => new { p.GroupId, p.SystembolagetProductId }).IsUnique();
            e.HasOne(p => p.Group).WithMany(g => g.Products).HasForeignKey(p => p.GroupId);
            e.HasOne(p => p.AddedByMember).WithMany().HasForeignKey(p => p.AddedByMemberId);
        });

        modelBuilder.Entity<Vote>(e =>
        {
            e.HasKey(v => v.Id);
            e.HasIndex(v => new { v.GroupId, v.MemberId }).IsUnique();
            e.HasOne(v => v.Group).WithMany(g => g.Votes).HasForeignKey(v => v.GroupId);
            e.HasOne(v => v.Member).WithMany(m => m.Votes).HasForeignKey(v => v.MemberId);
            e.HasOne(v => v.Product).WithMany(p => p.Votes).HasForeignKey(v => v.ProductId);
        });

        modelBuilder.Entity<OrderLine>(e =>
        {
            e.HasKey(o => o.Id);
            e.HasIndex(o => new { o.GroupId, o.MemberId }).IsUnique();
            e.HasOne(o => o.Group).WithMany(g => g.OrderLines).HasForeignKey(o => o.GroupId);
            e.HasOne(o => o.Member).WithOne(m => m.OrderLine).HasForeignKey<OrderLine>(o => o.MemberId);
        });

        modelBuilder.Entity<OrderRound>(e =>
        {
            e.HasKey(r => r.Id);
            e.HasIndex(r => new { r.GroupId, r.RoundNumber }).IsUnique();
            e.HasOne(r => r.Group).WithMany(g => g.OrderRounds).HasForeignKey(r => r.GroupId);
        });

        modelBuilder.Entity<OrderRoundLine>(e =>
        {
            e.HasKey(l => l.Id);
            e.HasOne(l => l.OrderRound).WithMany(r => r.Lines).HasForeignKey(l => l.OrderRoundId);
        });
    }
}
