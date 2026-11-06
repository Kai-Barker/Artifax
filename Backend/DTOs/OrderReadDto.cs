namespace Artifax.DTOs
{
    public class OrderReadDto
    {
        public int OrderID { get; set; }
        public int ItemID { get; set; }
        public string ItemName { get; set; } = string.Empty;
        public int Quantity { get; set; }
        public DateTime CreatedDateTime { get; set; }
        public DateTime? StartedDateTime { get; set; }
        public DateTime? CompletedDateTime { get; set; }
        public int TotalTime { get; set; }
        public int TimeElapsed { get; set; }
        public int BranchID { get; set; }
        public int EmployeeID { get; set; }
        public bool OrderExpedite { get; set; }
        public int? QueuePosition { get; set; }
        public string Status { get; set; } = string.Empty;
    }
}
