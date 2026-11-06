export type QueueJobStatus = 'Queued' | 'Active' | 'Paused';

export function normalizeQueueStatus(status?: string): QueueJobStatus | null {
  const normalized = (status ?? '').trim().toLowerCase();

  if (normalized === 'active' || normalized === 'in progress') return 'Active';
  if (normalized === 'paused') return 'Paused';
  if (normalized === 'queued' || normalized === 'pending') return 'Queued';

  return null;
}

// How the backend models expediting (OrderTimeTrackingService):
//   TimeElapsed is production *work done*, not wall-clock minutes.
//   Each minute it grows by 1 (standard) or 2 (expedited), and the order completes
//   when TimeElapsed >= TotalTime. TotalTime itself never changes.
// So progress is always TimeElapsed / TotalTime, and expediting only halves the
// *remaining* wall-clock time. Work already done is unaffected.
const EXPEDITE_SPEED = 2;

export function calculateProgress(totalTime?: number, timeElapsed?: number, _expedited = false): number {
  if (totalTime == null || totalTime <= 0 || timeElapsed == null) return 0;
  return Math.min(100, Math.max(0, Math.round((timeElapsed / totalTime) * 100)));
}

export function formatTimeLeft(totalTime?: number, timeElapsed?: number, expedited = false): string {
  if (totalTime == null || timeElapsed == null) {
    return 'No estimate';
  }

  const remainingWork = Math.max(0, totalTime - timeElapsed);
  if (remainingWork === 0) return 'Complete';

  const minutesLeft = Math.ceil(remainingWork / (expedited ? EXPEDITE_SPEED : 1));
  return `${minutesLeft} min left`;
}
