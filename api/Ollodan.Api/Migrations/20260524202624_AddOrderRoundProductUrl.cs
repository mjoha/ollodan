using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ollodan.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderRoundProductUrl : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "ProductUrl",
                table: "OrderRounds",
                type: "TEXT",
                nullable: false,
                defaultValue: "");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "ProductUrl",
                table: "OrderRounds");
        }
    }
}
