import React, { FC, useEffect, useState } from 'react';
import './craftingItems.css';
import unitIcon from '../../../../assets/images/uniitIcon.png';
import unitIconWhite from '../../../../assets/images/uniitIconWhite.png';
import { useApi, useThemeAwareIcon } from '../../../../hooks';
import { useCurrentUser } from '../../../../utils/currentUser';
import { calculateProgress, formatTimeLeft, normalizeQueueStatus, QueueJobStatus } from '../../../../services/craftingUtils';
import { showError } from '../../../../utils/toast';
import axios from 'axios';

// Matches the backend rule (OrderController.UpdateOrderStatus / OrderTimeTrackingService).
const MAX_ACTIVE_PER_BRANCH = 3;

const activeLimitMessage = (job: { name: string; branchName: string }): string =>
  `Can't resume ${job.name}. ${job.branchName} already has ${MAX_ACTIVE_PER_BRANCH} crafts in progress. Pause or finish one first.`;

interface TiltsState {
  [key: string]: string;
}

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
};

type EmployeeDto = {
  employeeId: number;
  employeeName: string;
};

type IngredientDto = {
  ingredientID?: number;
  itemID?: number;
  itemName?: string;
  quantity?: number;
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
  employeeID?: number;
  expedited: boolean;
  branchID: number;
  branchName: string;
};

const CraftingItems: FC = () => {
  const api = useApi();
  const currentUser = useCurrentUser();
  const [tilts, setTilts] = useState<TiltsState>({});
  const [activeJobs, setActiveJobs] = useState<CraftingJob[]>([]);
  const [branchMap, setBranchMap] = useState<Record<number, string>>({});

  const ORDER_REFRESH_INTERVAL_MS = 60_000;

  const loadActiveJobs = async (): Promise<void> => {
    try {
      const [ordersResponse, usersResponse, branchesResponse] = await Promise.all([
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

      const employees = (usersResponse.data as EmployeeDto[]).reduce<Record<number, string>>((map, user) => {
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

      const sortedOrders = ordersResponse.data
        .slice()
        .sort((a, b) => new Date(a.createdDateTime).getTime() - new Date(b.createdDateTime).getTime())
        .filter((order) => {
          const status = normalizeQueueStatus(order.status);
          if (status !== 'Active' && status !== 'Paused') {
            return false;
          }

          const orderBranchId = order.branchID ?? order.BranchID ?? 0;
          if (allowedBranchIds.length > 0) {
            return allowedBranchIds.includes(orderBranchId);
          }

          return true;
        });

      const jobs = sortedOrders.map((order) => {
        const expedited = order.orderExpedite === true;
        const status = normalizeQueueStatus(order.status) ?? 'Paused';
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
          employeeID: order.employeeID ?? undefined,
          expedited,
          branchID,
          branchName: branchMapFromApi[branchID] ?? `Branch ${branchID}`,
        };
      });

      const uniqueItemIds: number[] = Array.from(new Set(jobs.map((job) => job.itemID))) as number[];
      const ingredientResponses = await Promise.all(
        uniqueItemIds.map(async (itemID: number) => {
          try {
            return await api.get<IngredientDto[]>(`/Item/itemIngredient/item/${itemID}`);
          } catch (error) {
            return null as null;
          }
        })
      );

      const ingredientsByItemId = uniqueItemIds.reduce<Record<number, string[]>>((map, itemID: number, index: number) => {
        const response = ingredientResponses[index];
        if (response?.data) {
          const list = response.data as IngredientDto[];
          map[itemID] = list.map((ingredient) => {
            const name = ingredient.itemName ?? `Ingredient ${ingredient.ingredientID ?? ''}`;
            const quantity = ingredient.quantity ?? 1;
            return `${name} x${quantity}`;
          });
        }
        return map;
      }, {});

      setActiveJobs(
        jobs.map((job) => ({
          ...job,
          materials: ingredientsByItemId[job.itemID] ?? job.materials,
        }))
      );
    } catch (error) {
      console.error('Unable to load crafting items orders', error);
    }
  };

  useEffect(() => {
    let isMounted = true;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const refresh = async (): Promise<void> => {
      if (!isMounted) return;
      await loadActiveJobs();
    };

    const handleOrderUpdated = (): void => {
      void refresh();
    };

    void refresh();
    intervalId = setInterval(() => {
      void refresh();
    }, ORDER_REFRESH_INTERVAL_MS);

    window.addEventListener('crafting-order-updated', handleOrderUpdated);

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
      }
      window.removeEventListener('crafting-order-updated', handleOrderUpdated);
    };
}, [api, currentUser]);

  const unitIconSrc = useThemeAwareIcon(unitIcon, unitIconWhite);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>, id: string): void => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = (y - centerY) / centerY * -1.3;
    const rotateY = (x - centerX) / centerX * 1.3;

    setTilts((prev) => ({
      ...prev,
      [id]: `scale(1.02) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
    }));
  };

  const handleMouseLeave = (id: string): void => {
    setTilts((prev) => ({
      ...prev,
      [id]: '',
    }));
  };

  const handleCancel = async (job: CraftingJob): Promise<void> => {
    try {
      await api.put(`/Order/${job.orderID}/status`, { status: 'Cancelled' });
      window.dispatchEvent(new CustomEvent('crafting-order-updated'));
      await loadActiveJobs();
    } catch (error) {
      console.error(`Unable to cancel order ${job.orderID}`, error);
    }
  };

  const handlePauseResume = async (job: CraftingJob): Promise<void> => {
    const nextStatus = job.status === 'Paused' ? 'Active' : 'Paused';

    // Resuming needs a free slot at the order's branch; check before calling the API.
    if (nextStatus === 'Active') {
      const activeAtBranch = activeJobs.filter((other) => other.branchID === job.branchID && other.status === 'Active').length;
      if (activeAtBranch >= MAX_ACTIVE_PER_BRANCH) {
        showError(activeLimitMessage(job));
        return;
      }
    }

    try {
      await api.put(`/Order/${job.orderID}/status`, { status: nextStatus });
      window.dispatchEvent(new CustomEvent('crafting-order-updated'));
      await loadActiveJobs();
    } catch (error) {
      console.error(`Unable to update order ${job.orderID} status to ${nextStatus}`, error);

      // The backend also enforces the limit (e.g. a queued order started in the meantime).
      const isLimitError = nextStatus === 'Active'
        && axios.isAxiosError(error)
        && error.response?.status === 400
        && String(error.response.data ?? '').includes('active orders');

      if (isLimitError) {
        showError(activeLimitMessage(job));
        await loadActiveJobs();
      } else {
        showError(`Unable to ${nextStatus === 'Active' ? 'resume' : 'pause'} ${job.name}. Please try again.`);
      }
    }
  };

  const handleToggleExpedite = async (job: CraftingJob): Promise<void> => {
    const nextExpedite = !job.expedited;
    try {
      await api.put(`/Order/${job.orderID}`, {
        itemID: job.itemID,
        quantity: job.qty,
        branchID: job.branchID,
        employeeID: job.employeeID ?? currentUser?.employeeId ?? 0,
        orderExpedite: nextExpedite,
      });
      window.dispatchEvent(new CustomEvent('crafting-order-updated'));
      await loadActiveJobs();
    } catch (error) {
      console.error(`Unable to update expedite for order ${job.orderID}`, error);
    }
  };

  return (
    <div className="active-grid">
      {activeJobs.length === 0 && <p className="empty-state">No active jobs available.</p>}
      {activeJobs.map((job) => (
        <div
          key={job.orderID}
          className="job-card"
          onMouseMove={(e) => handleMouseMove(e, String(job.orderID))}
          onMouseLeave={() => handleMouseLeave(String(job.orderID))}
          style={{ transform: tilts[String(job.orderID)] || '' }}
        >
          <div className="card-header">
            <div className="job-info-main">
              <div className="job-icon-box">
                <img src={unitIconSrc} alt={`${job.name} icon`} className="job-icon" />
              </div>
              <div className="job-titles">
                <h3>{job.name}</h3>
                <p>Employee: {job.employeeName} · Qty: {job.qty} · {job.branchName}</p>
              </div>
            </div>
            <span className={`status-badge ${job.status.toLowerCase().replace(' ', '-')}`}>
              {job.status}
            </span>
          </div>

          <div className="progress-section">
            <div className="progress-text">
              <span>{job.progress}% Complete</span>
              <span>{job.timeLeft}</span>
            </div>
            <div className="progress-bar-bg">
              <div className="progress-bar-fill" style={{ width: `${job.progress}%` }}></div>
            </div>
          </div>

          <div className="expedite-section">
            <div className="expedite-control">
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={job.expedited}
                  onChange={() => void handleToggleExpedite(job)}
                  aria-label={`Order Expedite for ${job.name}`}
                />
                <span className="slider" />
              </label>
              <div className="expedite-labels">
                <span className="expedite-title">Order Expedite</span>
                <span className="expedite-status">{job.expedited ? 'Double speed · remaining time halved' : 'Standard production'}</span>
              </div>
            </div>
          </div>

          <div className="materials-section">
            <p className="section-label">MATERIALS USED</p>
            <div className="material-tags">
              {job.materials.map((m, i) => (
                <span key={i} className="material-tag">{m}</span>
              ))}
            </div>
          </div>

          <div className="card-actions">
            <button className="btn-cancel" type="button" onClick={() => void handleCancel(job)}>
              Cancel
            </button>
            <button
              className={`btn-action ${job.status === 'Paused' ? 'resume' : 'pause'}`}
              type="button"
              onClick={() => handlePauseResume(job)}
            >
              {job.status === 'Paused' ? 'Resume' : 'Pause'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default CraftingItems;
