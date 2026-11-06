// Layout and small UI components used on the dashboard page
import AlertStrip from '../../components/layout/AlertStrip';
import PageHeader from '../../components/layout/PageHeader';
import SectionCard from '../../components/common/SectionCard';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';

import { buildInventoryOverview, getInventoryItems, InventoryItem, DashboardPreviewRow } from '../../services/inventoryApi';
import { getCraftingQueue, QueueJob } from '../../services/orderApi';
import '../crafting/components/craftingItems/craftingItems.css';
import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { getCurrentDateSAST } from '../../Date/dateUtils';

function DashboardPage() {
  const currentDate = getCurrentDateSAST();
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [loadingInventory, setLoadingInventory] = useState<boolean>(true);
  const [activeJobs, setActiveJobs] = useState<QueueJob[]>([]);
  const [queuedJobs, setQueuedJobs] = useState<QueueJob[]>([]);
  const isFetchingRef = useRef(false);
  const mountedRef = useRef(true);

  const refreshJobs = useCallback(async () => {
    if (!mountedRef.current || isFetchingRef.current) {
      return;
    }

    isFetchingRef.current = true;

    try {
      const { activeItems, queuedItems } = await getCraftingQueue();

      if (!mountedRef.current) {
        return;
      }

      setActiveJobs(activeItems);
      setQueuedJobs(queuedItems);
    } catch (err) {
      console.error('Failed to load crafting jobs', err);

      if (mountedRef.current) {
        setActiveJobs([]);
        setQueuedJobs([]);
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;
    mountedRef.current = true;

    // load inventory once
    setLoadingInventory(true);
    getInventoryItems()
      .then((rows) => {
        if (mountedRef.current) setInventoryItems(rows);
      })
      .catch((err) => {
        console.error('Failed to load dashboard inventory data', err);
        if (mountedRef.current) setInventoryItems([]);
      })
      .finally(() => {
        if (mountedRef.current) setLoadingInventory(false);
      });

    // initial load and interval
    void refreshJobs();
    intervalId = setInterval(() => {
      void refreshJobs();
    }, 10000);

    return () => {
      mountedRef.current = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [refreshJobs]);

  const inventoryOverview = useMemo(() => buildInventoryOverview(inventoryItems), [inventoryItems]);

  const previewRows: DashboardPreviewRow[] = inventoryOverview.previewRows;

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader title="Inventory & Crafting" subtitle={`Main Dashboard · ${currentDate}`} />

      <AlertStrip items={inventoryOverview.items} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {inventoryOverview.stats.map((stat) => (
          <StatCard key={stat.id} label={stat.label} value={stat.value} />
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr,1fr]">
        <SectionCard title="Inventory" subtitle={`${inventoryItems.length} items`}>
          {loadingInventory ? (
            <div className="py-8 text-center text-sm text-muted">Loading inventory...</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-left text-sm">
                <thead className="font-outfit text-xs uppercase tracking-wide text-muted">
                  <tr className="border-b border-border">
                    <th className="dashboard-material-column pb-2 font-medium">Material</th>
                    <th className="qty-column pb-2 font-medium"><span className="qty-header">Qty</span></th>
                    <th className="dashboard-location-column pb-2 font-medium"><span className="location-header">Location</span></th>
                    <th className="pb-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    // Item ids repeat across branches, so include the location in the key.
                    <tr key={`${row.id}-${row.location}`} className="border-b border-border/70">
                      <td className="dashboard-material-column py-2.5 font-medium text-text">{row.name}</td>
                      <td className="qty-column py-2.5 text-text"><span className="qty-value">{row.qty}</span></td>
                      <td className="dashboard-location-column py-2.5 text-muted"><span className="location-value">{row.location}</span></td>
                      <td className="py-2.5">
                        <StatusBadge status={row.status} />
                      </td>
                    </tr>
                  ))}

                  {previewRows.length === 0 && (
                    <tr>
                      <td className="py-6 text-center text-sm text-muted" colSpan={4}>
                        No live inventory rows available yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>

        <SectionCard title="Crafting Queue" subtitle="Live from Orders">
          <div className="space-y-3">
            <div>
              <h4 className="mb-2 text-sm font-medium">Active Jobs</h4>
              {activeJobs.length === 0 ? (
                <div className="rounded-xl border border-border bg-app p-3 text-sm text-muted">No active jobs</div>
              ) : (
                <div className="space-y-2">
                  {activeJobs.map((job) => (
                    <div key={job.id} className="job-card p-3">
                      <div className="card-header">
                        <div className="job-info-main">
                          <div className="job-titles">
                            <h3 className="text-sm font-medium">{job.name}</h3>
                            <p className="text-xs text-muted">ID: {job.id} · Qty: {job.qty}</p>
                          </div>
                        </div>
                        <span className={`status-badge ${job.status.toLowerCase().replace(/\s+/g, '-')}`}>{job.status}</span>
                      </div>

                      <div className="progress-section mt-2">
                        <div className="progress-text flex justify-between text-xs text-muted">
                          <span>{job.progress}% Complete</span>
                          <span>{job.timeLeft}</span>
                        </div>
                        <div className="progress-bar-bg mt-2">
                          <div className="progress-bar-fill" style={{ width: `${job.progress}%` }}></div>
                        </div>
                      </div>

                      <div className="materials-section mt-3">
                        <p className="section-label text-[11px] text-muted">MATERIALS</p>
                        <div className="material-tags mt-2">
                          {job.materials.slice(0, 6).map((m, i) => (
                            <span key={i} className="material-tag">{m}</span>
                          ))}
                          {job.materials.length > 6 && <span className="material-tag">+{job.materials.length - 6} more</span>}
                        </div>
                      </div>

                      <div className="card-actions mt-3 flex gap-2">
                        <div className="text-xs text-muted">{job.employeeName}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <h4 className="mb-2 text-sm font-medium">Queued Jobs</h4>
              {queuedJobs.length === 0 ? (
                <div className="rounded-xl border border-border bg-app p-3 text-sm text-muted">No queued jobs</div>
              ) : (
                <div className="space-y-2">
                  {queuedJobs.map((job) => (
                    <div key={job.id} className="job-card p-3">
                      <div className="card-header">
                        <div className="job-info-main">
                          <div className="job-titles">
                            <h3 className="text-sm font-medium">{job.name}</h3>
                            <p className="text-xs text-muted">ID: {job.id} · Qty: {job.qty}</p>
                          </div>
                        </div>
                        <span className={`status-badge ${job.status.toLowerCase().replace(/\s+/g, '-')}`}>{job.status}</span>
                      </div>

                      <div className="mt-2 flex items-center justify-between text-xs text-muted">
                        <div>{job.location}</div>
                        <div>{job.timeLeft}</div>
                      </div>

                      <div className="card-actions mt-3 flex gap-2">
                       <div className="text-xs text-muted">
  {(() => {
    const parsedDate = job.createdDateTime ? new Date(job.createdDateTime) : null;
    const isValidDate = parsedDate && !isNaN(parsedDate.getTime());
    
    return isValidDate 
      ? `Created ${new Intl.DateTimeFormat('en-ZA', { dateStyle: 'short', timeStyle: 'short' }).format(parsedDate)}`
      : 'Created: Date Unknown';
  })()}
</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </SectionCard>
      </div>
    </div>
  );
}

export default DashboardPage;
