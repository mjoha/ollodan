using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ollodan.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddMemberTransferCode : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MemberTransferCodes",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "TEXT", nullable: false),
                    MemberId = table.Column<Guid>(type: "TEXT", nullable: false),
                    GroupId = table.Column<Guid>(type: "TEXT", nullable: false),
                    Code = table.Column<string>(type: "TEXT", nullable: false),
                    ExpiresAt = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CreatedAt = table.Column<DateTime>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MemberTransferCodes", x => x.Id);
                    table.ForeignKey(
                        name: "FK_MemberTransferCodes_Groups_GroupId",
                        column: x => x.GroupId,
                        principalTable: "Groups",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_MemberTransferCodes_Members_MemberId",
                        column: x => x.MemberId,
                        principalTable: "Members",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_MemberTransferCodes_Code",
                table: "MemberTransferCodes",
                column: "Code",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_MemberTransferCodes_GroupId",
                table: "MemberTransferCodes",
                column: "GroupId");

            migrationBuilder.CreateIndex(
                name: "IX_MemberTransferCodes_MemberId",
                table: "MemberTransferCodes",
                column: "MemberId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MemberTransferCodes");
        }
    }
}
