import React, { FC, useEffect, useMemo, useState } from 'react';
import './craftingQueue.css';
import unitIcon from '../../../../assets/images/uniitIcon.png';
import unitIconWhite from '../../../../assets/images/uniitIconWhite.png';
import { useApi, useThemeAwareIcon } from '../../../../hooks';
import { useCurrentUser } from '../../../../utils/currentUser';
import { calculateProgress, formatTimeLeft, normalizeQueueStatus, QueueJobStatus } from '../../../../services/craftingUtils';

const itemsPerPage = 3;

type OrderDto = {
  orderID: number;
  itemID: number;
  itemName: string;
  quantity: number;
  createdDateTime: string;
  totalTime?: number;
  timeElapsed?: number;
  status: string;
  branchID?: number;
  BranchID?: number;
  employeeID?: number;
  orderExpedite?: boolean;
  queuePosition?: number | null;
};

type EmployeeDto = {
  employeeId: number;
  employeeName: string;
};

type BranchDto = {
  BranchID?: number;
  branchID?: number;
  BranchName?: string;
  branchName?: string;
};

type CraftingJob = {
  orderID: number;
  itemID: number;
  name: string;
  qty: number;
  status: QueueJobStatus;
  progress: number;
  timeLeft: string;
  materials: string[];
  employeeName: string;
  createdDateTime: string;
  branchID: number;
  branchName: string;
  queuePosition: number | null;
};

// Same order the backend scheduler starts them in: per branch, by queue position, then oldest first.
function sortQueued(jobs: CraftingJob[]): CraftingJob[] {
  return jobs.slice().sort((a, b) =>
    a.branchName.localeCompare(b.branchName)
    || (a.queuePosition ?? Number.MAX_SAFE_INTEGER) - (b.queuePosition ?? Number.MAX_SAFE_INTEGER)
    || new Date(a.createdDateTime).getTime() - new Date(b.createdDateTime).getTime());
}

const CraftingQueue: FC = () => {
  const api = useApi();
  const currentUser = useCurrentUser();
  const [page, setPage] = useState<number>(1);
  const [activeJobs, setActiveJobs] = useState<CraftingJob[]>([]);
  const [queuedJobs, setQueuedJobs] = useState<CraftingJob[]>([]);
  const [branchMap, setBranchMap] = useState<Record<number, string>>({});

  const unitIconSrc = useThemeAwareIcon(unitIcon, unitIconWhite);

  useEffect(() => {
    const REFRESH_INTERVAL_MS = 60_000;
    let isMounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const loadJobs = async (): Promise<void> => {
      try {
        const [ordersResponse, userResponse, branchesResponse] = await Promise.all([
          api.get<OrderDto[]>('/Order'),
          api.get<EmployeeDto[]>('/User'),
          api.get<BranchDto[]>('/Branch'),
        ]);

        const branchMapFromApi = (branchesResponse.data ?? []).reduce<Record<number, string>>((map, branch) => {
          const branchId = branch.BranchID ?? branch.branchID ?? 0;
          const branchName = branch.BranchName ?? branch.branchName ?? '';
          if (branchId > 0 && branchName) {
            map[branchId] = branchName;
          }
          return map;
        }, {});

        setBranchMap(branchMapFromApi);

        const employees = (userResponse.data as EmployeeDto[]).reduce<Record<number, string>>((map, user) => {
          if (user.employeeId != null) {
            map[user.employeeId] = user.employeeName;
          }
          return map;
        }, {});

        const allowedBranchIds = currentUser?.branchId === 3
          ? []
          : currentUser?.branchId != null
            ? [currentUser.branchId]
            : [];

        const orders = ordersResponse.data
          .slice()
          .sort((a, b) => new Date(a.createdDateTime).getTime() - new Date(b.createdDateTime).getTime())
          .filter((order) => {
            const status = normalizeQueueStatus(order.status);
            if (status !== 'Queued' && status !== 'Active' && status !== 'Paused') {
              return false;
            }

            const orderBranchId = order.branchID ?? order.BranchID ?? 0;
            if (allowedBranchIds.length > 0) {
              return allowedBranchIds.includes(orderBranchId);
            }

            return true;
          });

        const jobs = orders.map((order) => {
          const expedited = order.orderExpedite === true;
          const status = normalizeQueueStatus(order.status) ?? 'Queued';
          const branchID = order.branchID ?? order.BranchID ?? 0;

          return {
            orderID: order.orderID,
            itemID: order.itemID,
            name: order.itemName || `Order ${order.orderID}`,
            qty: order.quantity ?? 1,
            status,
            progress: calculateProgress(order.totalTime, order.timeElapsed, expedited),
            timeLeft: formatTimeLeft(order.totalTime, order.timeElapsed, expedited),
            materials: [order.itemName || `Item ${order.itemID}`],
            employeeName: employees[order.employeeID ?? 0] ?? 'Unknown Employee',
            createdDateTime: order.createdDateTime,
            branchID,
            branchName: branchMapFromApi[branchID] ?? `Branch ${branchID}`,
            queuePosition: order.queuePosition ?? null,
          };
        });

        if (!isMounted) return;

        setActiveJobs(jobs.filter((job) => job.status === 'Active' || job.status === 'Paused'));
        setQueuedJobs(sortQueued(jobs.filter((job) => job.status === 'Queued')));
      } catch (error) {
        console.error('Failed to load crafting queue orders', error);
      }
    };

    const refreshJobs = async (): Promise<void> => {
      if (!isMounted) return;
      await loadJobs();
    };

    const listener = (): void => {
      if (isMounted) {
        void refreshJobs();
      }
    };

    void refreshJobs();
    intervalId = setInterval(() => {
      void refreshJobs();
    }, REFRESH_INTERVAL_MS);

    window.addEventListener('crafting-order-updated', listener);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      window.removeEventListener('crafting-order-updated', listener);
    };
  }, [api, currentUser]);

  const queuedPageCount = Math.ceil(queuedJobs.length / itemsPerPage);
  const totalPages = queuedPageCount > 0 ? queuedPageCount + 1 : 1;
  const pageItems = page > 1
    ? queuedJobs.slice((page - 2) * itemsPerPage, (page - 1) * itemsPerPage)
    : [];
  const activeCount = activeJobs.length;

  const [savingQueue, setSavingQueue] = useState<boolean>(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  // Each queued job's place within its own branch's queue (queues are per branch).
  const branchQueuePlace = useMemo(() => {
    const places: Record<number, { index: number; count: number }> = {};
    const counts: Record<number, number> = {};
    queuedJobs.forEach((job) => {
      const index = counts[job.branchID] ?? 0;
      counts[job.branchID] = index + 1;
      places[job.orderID] = { index, count: 0 };
    });
    queuedJobs.forEach((job) => {
      places[job.orderID].count = counts[job.branchID];
    });
    return places;
  }, [queuedJobs]);

  const moveQueued = async (job: CraftingJob, direction: -1 | 1): Promise<void> => {
    const branchQueue = queuedJobs.filter((queued) => queued.branchID === job.branchID);
    const index = branchQueue.findIndex((queued) => queued.orderID === job.orderID);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= branchQueue.length) return;

    const reordered = branchQueue.slice();
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    const renumbered = reordered.map((queued, i) => ({ ...queued, queuePosition: i + 1 }));

    const previous = queuedJobs;
    setQueuedJobs(sortQueued([...queuedJobs.filter((queued) => queued.branchID !== job.branchID), ...renumbered]));
    setSavingQueue(true);
    setQueueError(null);

    try {
      await api.put(`/Order/branch/${job.branchID}/queue`, { orderIds: renumbered.map((queued) => queued.orderID) });
    } catch (error) {
      console.error(`Failed to reorder queue for branch ${job.branchID}`, error);
      setQueuedJobs(previous);
      setQueueError('Could not save the new order. The queue may have changed, so it has been refreshed.');
    } finally {
      setSavingQueue(false);
      window.dispatchEvent(new Event('crafting-order-updated'));
    }
  };

  const handlePrevious = (): void => setPage((prev) => Math.max(1, prev - 1));
  const handleNext = (): void => setPage((prev) => Math.min(totalPages, prev + 1));

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  return (
    <div className="queue-sidebar">
      <div className="queue-header">
        <div className="queue-title-row">
          <h3>Crafting Queue</h3>
          <span className="queue-count">{activeCount} / 3</span>
        </div>
        <p className="limit-note">Maximum 3 active crafts per location</p>
      </div>

      {page === 1 ? (
        <div className="queue-section">
          <h4 className="queue-section-title">Active Crafts</h4>
          {activeJobs.length === 0 && <p className="empty-state">No active crafts right now.</p>}
          {activeJobs.map((item) => (
            <div key={item.orderID} className="queue-item">
              <div className="queue-item-header">
                <div className="item-info">
                  <img src={unitIconSrc} alt={`${item.name} icon`} className="queue-item-icon" />
                  <div>
                    <h4>{item.name} x{item.qty} · {item.branchName}</h4>
                    <p>{item.status} · {item.employeeName}</p>
                  </div>
                </div>
                <span className={`queue-badge ${item.status.toLowerCase().replace(' ', '-')}`}>
                  {item.status}
                </span>
              </div>
              <div className="waiting-status">
                <span>{item.progress}% complete</span>
                <span>{item.timeLeft}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="queue-section">
          <h4 className="queue-section-title">Up Next</h4>
          {queueError && <p className="queue-error" role="alert">{queueError}</p>}
          {pageItems.length === 0 && <p className="empty-state">No queued items ready yet.</p>}
          {pageItems.map((item) => {
            const place = branchQueuePlace[item.orderID] ?? { index: 0, count: 1 };
            return (
            <div key={item.orderID} className="queue-item">
              <div className="queue-item-header">
                <div className="item-info">
                  <img src={unitIconSrc} alt={`${item.name} icon`} className="queue-item-icon" />
                  <div>
                    <h4>{item.name} x{item.qty} · {item.branchName}</h4>
                    <p>#{place.index + 1} in queue · Created {new Intl.DateTimeFormat('en-ZA', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.createdDateTime))}</p>
                  </div>
                </div>
                <div className="queue-item-actions">
                  <div className="queue-move" role="group" aria-label={`Move ${item.name} in queue`}>
                    <button
                      type="button"
                      onClick={() => void moveQueued(item, -1)}
                      disabled={savingQueue || place.index === 0}
                      aria-label={`Move ${item.name} earlier`}
                      title="Start earlier"
                    >
                      ▲
                    </button>
                    <button
                      type="button"
                      onClick={() => void moveQueued(item, 1)}
                      disabled={savingQueue || place.index >= place.count - 1}
                      aria-label={`Move ${item.name} later`}
                      title="Start later"
                    >
                      ▼
                    </button>
                  </div>
                  <span className={`queue-badge ${item.status.toLowerCase().replace(' ', '-')}`}>
                    {item.status}
                  </span>
                </div>
              </div>
              <div className="waiting-status">
                <span>Waiting to start</span>
                <span>{item.timeLeft}</span>
              </div>
            </div>
            );
          })}
        </div>
      )}

      <div className="queue-footer">
        <button type="button" onClick={handlePrevious} disabled={page === 1}>Prev</button>
        <span>Page {page} / {totalPages}</span>
        <button type="button" onClick={handleNext} disabled={page === totalPages}>Next</button>
      </div>
    </div>
  );
};

export default CraftingQueue;
