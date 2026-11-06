using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Backend.Migrations
{
    /// <inheritdoc />
    public partial class AddOrderQueuePosition : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "QueuePosition",
                table: "Orders",
                type: "integer",
                nullable: true);

            // Number existing queued orders oldest-first within each branch (the previous start order).
            migrationBuilder.Sql(@"
                UPDATE ""Orders"" o
                SET ""QueuePosition"" = q.pos
                FROM (
                    SELECT ""OrderID"", ROW_NUMBER() OVER (PARTITION BY ""BranchID"" ORDER BY ""CreatedDateTime"", ""OrderID"") AS pos
                    FROM ""Orders""
                    WHERE ""Status"" = 'Queued'
                ) q
                WHERE o.""OrderID"" = q.""OrderID"";
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "QueuePosition",
                table: "Orders");
        }
    }
}
