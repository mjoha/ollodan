using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Ollodan.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddGroupOptions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "AdminMemberId",
                table: "Groups",
                type: "TEXT",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.AddColumn<bool>(
                name: "AllowSuggestions",
                table: "Groups",
                type: "INTEGER",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "IsRepeating",
                table: "Groups",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            BackfillAdminMemberId(migrationBuilder);
        }

        /// <inheritdoc />
        internal static void BackfillAdminMemberId(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DELETE FROM OrderLines
                WHERE GroupId IN (
                    SELECT g.Id FROM Groups g
                    WHERE NOT EXISTS (SELECT 1 FROM Members m WHERE m.GroupId = g.Id)
                );
                DELETE FROM Votes
                WHERE GroupId IN (
                    SELECT g.Id FROM Groups g
                    WHERE NOT EXISTS (SELECT 1 FROM Members m WHERE m.GroupId = g.Id)
                );
                DELETE FROM Products
                WHERE GroupId IN (
                    SELECT g.Id FROM Groups g
                    WHERE NOT EXISTS (SELECT 1 FROM Members m WHERE m.GroupId = g.Id)
                );
                DELETE FROM Groups
                WHERE NOT EXISTS (SELECT 1 FROM Members m WHERE m.GroupId = Groups.Id);
                """);

            migrationBuilder.Sql(
                """
                UPDATE Groups
                SET AdminMemberId = (
                    SELECT m.Id FROM Members m
                    WHERE m.GroupId = Groups.Id
                    ORDER BY m.CreatedAt
                    LIMIT 1
                )
                WHERE AdminMemberId = '00000000-0000-0000-0000-000000000000'
                  AND EXISTS (SELECT 1 FROM Members m WHERE m.GroupId = Groups.Id);
                """);
        }

        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AdminMemberId",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "AllowSuggestions",
                table: "Groups");

            migrationBuilder.DropColumn(
                name: "IsRepeating",
                table: "Groups");
        }
    }
}
