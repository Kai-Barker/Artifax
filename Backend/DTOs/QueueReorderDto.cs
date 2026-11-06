namespace Artifax.DTOs
{
    // Body for PUT /api/Order/branch/{branchId}/queue.
    // OrderIds lists every queued order in the branch, in the order they should start (first starts next).
    public class QueueReorderDto
    {
        public List<int> OrderIds { get; set; } = new();
    }
}
