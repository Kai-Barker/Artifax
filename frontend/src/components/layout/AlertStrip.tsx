import { useEffect, useMemo, useRef, useState } from 'react';
import type { InventoryItem } from '../../services/inventoryApi';
import { useCurrentUser } from '../../utils/currentUser';

type AlertStripProps = {
  /** Inventory rows (one per item per branch). Rows with status 'LOW' are shown. */
  items: InventoryItem[];
};

type Scope = 'mine' | 'all';

type LowStockSite = { branchId: number; location: string; quantity: number };
type LowStockGroup = { id: string; name: string; sites: LowStockSite[] };

const SCOPE_STORAGE_KEY = 'artifax.lowStockScope';

function readStoredScope(): Scope {
  try {
    return window.localStorage.getItem(SCOPE_STORAGE_KEY) === 'all' ? 'all' : 'mine';
  } catch {
    return 'mine';
  }
}

function storeScope(scope: Scope): void {
  try {
    window.localStorage.setItem(SCOPE_STORAGE_KEY, scope);
  } catch {
    // Storage unavailable: the choice just won't be remembered.
  }
}

/** Groups LOW rows by item so the same item at several branches shows once. */
function groupLowStock(items: InventoryItem[]): LowStockGroup[] {
  const groups = new Map<string, LowStockGroup>();

  items
    .filter((item) => item.status === 'LOW')
    .forEach((item) => {
      const group = groups.get(item.id) ?? { id: item.id, name: item.name, sites: [] };
      group.sites.push({ branchId: item.branchId, location: item.location, quantity: item.quantity });
      groups.set(item.id, group);
    });

  return Array.from(groups.values())
    .map((group) => ({ ...group, sites: [...group.sites].sort((a, b) => a.quantity - b.quantity) }))
    .sort((a, b) => a.sites[0].quantity - b.sites[0].quantity || a.name.localeCompare(b.name));
}

const chipClass =
  'inline-flex items-center gap-1.5 rounded-full border border-dangerText/20 bg-dangerBg px-2 py-1 text-[11px] font-medium text-dangerText sm:text-xs';

function AlertStrip({ items }: AlertStripProps) {
  const currentUser = useCurrentUser();
  const userBranchId = currentUser?.branchId;
  const canFilterByBranch = userBranchId != null;

  const [scope, setScope] = useState<Scope>(readStoredScope);
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const stripRef = useRef<HTMLDivElement>(null);

  const effectiveScope: Scope = canFilterByBranch ? scope : 'all';

  const groups = useMemo(() => groupLowStock(items), [items]);

  const branchRows = useMemo(
    () => groups.flatMap((group) => {
      const site = group.sites.find((s) => s.branchId === userBranchId);
      return site ? [{ id: group.id, name: group.name, quantity: site.quantity }] : [];
    }),
    [groups, userBranchId],
  );

  const branchName =
    currentUser?.branchName ??
    items.find((item) => item.branchId === userBranchId)?.location ??
    'My branch';

  // Close the open dropdown on outside click or Escape.
  useEffect(() => {
    if (openGroupId == null) return undefined;

    const handlePointer = (event: MouseEvent) => {
      if (stripRef.current && !stripRef.current.contains(event.target as Node)) setOpenGroupId(null);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpenGroupId(null);
    };

    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [openGroupId]);

  const changeScope = (next: Scope) => {
    setScope(next);
    setOpenGroupId(null);
    storeScope(next);
  };

  const count = effectiveScope === 'mine' ? branchRows.length : groups.length;
  const label =
    effectiveScope === 'mine' ? `Low Stock · ${branchName}: ${count}` : `Low Stock · All branches: ${count}`;

  return (
    <div
      ref={stripRef}
      className="mb-4 flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-muted shadow-card sm:flex-row sm:items-start sm:justify-between sm:px-4 sm:text-sm"
    >
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <span className="nav-pill font-semibold text-text">{label}</span>

        {count === 0 && (
          <span className="text-muted">
            {effectiveScope === 'mine' ? 'Everything at this branch is above minimum stock.' : 'No low stock anywhere.'}
          </span>
        )}

        {effectiveScope === 'mine' &&
          branchRows.map((row) => (
            <span key={row.id} className={chipClass}>
              {row.name}
              <span className="font-semibold">· {row.quantity} left</span>
            </span>
          ))}

        {effectiveScope === 'all' &&
          groups.map((group) => {
            const isOpen = openGroupId === group.id;
            const siteCount = group.sites.length;

            return (
              <span key={group.id} className="relative">
                <button
                  type="button"
                  className={`${chipClass} cursor-pointer hover:border-dangerText/40`}
                  aria-expanded={isOpen}
                  aria-haspopup="true"
                  onClick={() => setOpenGroupId(isOpen ? null : group.id)}
                >
                  {group.name}
                  <span className="rounded-full bg-dangerText/10 px-1.5 font-semibold">
                    {siteCount === 1 ? `${group.sites[0].quantity} left` : `${siteCount} sites`}
                  </span>
                  <span aria-hidden="true" className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}>
                    ▾
                  </span>
                </button>

                {isOpen && (
                  <div
                    role="dialog"
                    aria-label={`${group.name} stock by branch`}
                    className="absolute left-0 top-full z-30 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-2 text-xs text-text shadow-card"
                  >
                    <p className="mb-1 px-1 font-semibold">{group.name}</p>
                    <ul>
                      {group.sites.map((site) => {
                        const isMine = site.branchId === userBranchId;
                        return (
                          <li
                            key={site.branchId}
                            className={`flex items-center justify-between gap-3 rounded px-1 py-1 ${isMine ? 'bg-dangerBg' : ''}`}
                          >
                            <span className="truncate">
                              {site.location}
                              {isMine && <span className="ml-1 text-muted">(your branch)</span>}
                            </span>
                            <span className="shrink-0 font-semibold text-dangerText">{site.quantity} left</span>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
              </span>
            );
          })}
      </div>

      {canFilterByBranch && (
        <div
          role="group"
          aria-label="Low stock scope"
          className="inline-flex shrink-0 self-start overflow-hidden rounded-full border border-border text-[11px] sm:text-xs"
        >
          {(['mine', 'all'] as Scope[]).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={effectiveScope === option}
              onClick={() => changeScope(option)}
              className={`px-3 py-1 font-medium transition-colors ${
                effectiveScope === option ? 'bg-primary text-white' : 'text-muted hover:text-text'
              }`}
            >
              {option === 'mine' ? 'My branch' : 'All branches'}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default AlertStrip;
