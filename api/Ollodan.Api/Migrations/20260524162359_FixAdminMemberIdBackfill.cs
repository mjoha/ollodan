using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ollodan.Api.Migrations
{
    /// <inheritdoc />
    public partial class FixAdminMemberIdBackfill : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder) =>
            AddGroupOptions.BackfillAdminMemberId(migrationBuilder);

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {

        }
    }
}
