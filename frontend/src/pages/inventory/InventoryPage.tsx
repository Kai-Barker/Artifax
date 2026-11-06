// React hooks and UI components used on the inventory page
import React, { useEffect, useMemo, useState } from 'react';
import FilterSelect from '../../components/common/FilterSelect';
import SearchInput from '../../components/common/SearchInput';
import SectionCard from '../../components/common/SectionCard';
import StatCard from '../../components/common/StatCard';
import StatusBadge from '../../components/common/StatusBadge';
import Tabs from '../../components/common/Tabs';
import AlertStrip from '../../components/layout/AlertStrip';
import PageHeader from '../../components/layout/PageHeader';
import InventoryMaterialsPopover from './components/InventoryMaterialsPopover';
import InventoryItemEditModal from './components/InventoryItemEditModal';
import InventoryItemCreateModal from './components/InventoryItemCreateModal';
import InventoryItemIngredientModal from './components/InventoryItemIngredientModal';
import { createInventoryItem, getItemCategoryOptions, getItems, getInventoryOverview, getItemMaterialDetails, updateInventoryItem, InventoryCreatedItem, InventoryItem, InventoryMaterialDetails, InventoryOverview, InventoryItemCreate, InventoryItemUpdate } from '../../services/inventoryApi';
import { getCurrentDateSAST } from '../../Date/dateUtils';
import editIcon from '../../assets/images/Edit Icon.png';
import viewIcon from '../../assets/images/View Icon.png';

// One inventory row = one item at one branch. Item IDs repeat across branches.
const inventoryRowKey = (item: InventoryItem): string => `${item.id}-${item.branchId}`;

function InventoryPage() {
  const currentDate = getCurrentDateSAST();
  const [activeTab, setActiveTab] = useState('all');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [zone, setZone] = useState('ALL');
  const [sortBy, setSortBy] = useState('NAME');
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryOverview, setInventoryOverview] = useState<InventoryOverview>({ items: [], previewRows: [], alerts: [], stats: [], tabs: [] });
  const [categoryOptions, setCategoryOptions] = useState<string[]>([]);
  // Rows are one item at one branch, so row actions must track both (see inventoryRowKey).
  const [expandedViewRowKey, setExpandedViewRowKey] = useState<string | null>(null);
  const [materialDetailsById, setMaterialDetailsById] = useState<Record<number, InventoryMaterialDetails | null>>({});
  const [loadingMaterialItemId, setLoadingMaterialItemId] = useState<number | null>(null);
  const [editingRow, setEditingRow] = useState<{ itemId: number; branchId: number } | null>(null);
  const [savingEditItemId, setSavingEditItemId] = useState<number | null>(null);
  const [creatingItem, setCreatingItem] = useState(false);
  const [createItemOpen, setCreateItemOpen] = useState(false);
  const [ingredientItem, setIngredientItem] = useState<InventoryCreatedItem | null>(null);

  useEffect(() => {
    let mounted = true;

    // Fetch Inventory
    Promise.all([getInventoryOverview(), getItems()])
      .then(([overview, items]) => {
        if (mounted) {
          setInventoryItems(overview.items);
          setInventoryOverview(overview);
          setCategoryOptions(getItemCategoryOptions(items));
        }
      })
      .catch((error) => {
        console.error('Failed to load inventory items', error);
        if (mounted) {
          setInventoryItems([]);
          setCategoryOptions([]);
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const closeExpandedView = (): void => {
    setExpandedViewRowKey(null);
  };

  const closeEditModal = (): void => {
    setEditingRow(null);
  };

  const openCreateModal = (): void => {
    setCreateItemOpen(true);
  };

  const closeCreateModal = (): void => {
    setCreateItemOpen(false);
  };

  const closeIngredientModal = (): void => {
    setIngredientItem(null);
  };

  const handleViewClick = async (item: InventoryItem): Promise<void> => {
    const numericItemId = Number(item.id);
    const rowKey = inventoryRowKey(item);

    if (expandedViewRowKey === rowKey) {
      closeExpandedView();
      return;
    }

    setExpandedViewRowKey(rowKey);

    // Materials come from the item's blueprint, so they're cached per item, not per branch row.

    if (Number.isNaN(numericItemId) || materialDetailsById[numericItemId] !== undefined) {
      return;
    }

    setLoadingMaterialItemId(numericItemId);

    try {
      const details = await getItemMaterialDetails(numericItemId);
      setMaterialDetailsById((current) => ({ ...current, [numericItemId]: details }));
    } catch (error) {
      console.error(`Failed to load materials for item ${numericItemId}`, error);
      setMaterialDetailsById((current) => ({ ...current, [numericItemId]: null }));
    } finally {
      setLoadingMaterialItemId((current) => (current === numericItemId ? null : current));
    }
  };

  const handleEditClick = (item: InventoryItem): void => {
    closeExpandedView();
    setEditingRow({ itemId: Number(item.id), branchId: item.branchId });
  };

  const handleSaveEdit = async (itemId: number, payload: InventoryItemUpdate): Promise<void> => {
    setSavingEditItemId(itemId);

    try {
      await updateInventoryItem(itemId, payload);
      const overview = await getInventoryOverview();
      setInventoryItems(overview.items);
      setInventoryOverview(overview);
      setEditingRow(null);
    } catch (error) {
      console.error(`Failed to save item ${itemId}`, error);
      throw error;
    } finally {
      setSavingEditItemId((current) => (current === itemId ? null : current));
    }
  };

  const handleCreateItem = async (payload: InventoryItemCreate): Promise<InventoryCreatedItem> => {
    setCreatingItem(true);

    try {
      const createdItem = await createInventoryItem(payload);
      const overview = await getInventoryOverview();
      setInventoryItems(overview.items);
      setInventoryOverview(overview);
      setCreateItemOpen(false);
      setIngredientItem(createdItem);
      return createdItem;
    } catch (error) {
      console.error('Failed to create inventory item', error);
      throw error;
    } finally {
      setCreatingItem(false);
    }
  };

  const sourceItems = inventoryItems;

  const locationOptions = useMemo(() => {
    const locations = Array.from(new Set(sourceItems.map((item) => item.location))).sort((left, right) => (left || '').localeCompare(right || ''));

    return [
      { label: 'Location: All', value: 'ALL' },
      ...locations.filter(Boolean).map((location) => ({ label: `Location: ${location}`, value: location })),
    ];
  }, [sourceItems]);

  const filteredItems = useMemo(() => {
    const searchLower = search.toLowerCase();
    const isActivelySearchingOrFiltering = searchLower.length > 0 || zone !== 'ALL';

    return sourceItems
      .filter((item) => {
        // FIX 1: Safely check for matches, accounting for an optional 's' at the end
        if (!isActivelySearchingOrFiltering && activeTab !== 'all') {
          const itemCategory = (item.category || '').toLowerCase();
          const itemTab = (item.tab || '').toLowerCase();
          const targetTab = activeTab.toLowerCase();
          
          const isMatch = (val1: string, val2: string) => 
            val1 === val2 || `${val1}s` === val2 || `${val2}s` === val1;

          if (!isMatch(itemCategory, targetTab) && !isMatch(itemTab, targetTab)) {
            return false;
          }
        }

        if (status !== 'ALL' && item.status !== status) {
          return false;
        }

        if (zone !== 'ALL' && item.location !== zone) {
          return false;
        }

        if (searchLower.length === 0) {
          return true;
        }

        const safeName = (item.name || '').toLowerCase();
        const safeSku = (item.sku || '').toLowerCase();
        const safeLocation = (item.location || '').toLowerCase();

        return (
          safeName.includes(searchLower) ||
          safeSku.includes(searchLower) ||
          safeLocation.includes(searchLower)
        );
      })
      .sort((left, right) => {
        if (sortBy === 'QTY') {
          return (right.quantity || 0) - (left.quantity || 0);
        }
        return (left.name || '').localeCompare(right.name || '');
      });
  }, [activeTab, sourceItems, search, sortBy, status, zone]);

  useEffect(() => {
    console.log('InventoryPage filteredItems', {
      activeTab,
      search,
      status,
      zone,
      sortBy,
      filteredCount: filteredItems.length,
      filteredItems,
    });
  }, [activeTab, search, status, zone, sortBy, filteredItems]);

  return (
    <div className="space-y-4 sm:space-y-5">
      <PageHeader
        title="Inventory Management"
        subtitle={`Full Inventory · ${currentDate}`}
        rightSlot={
          <button type="button" className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-primary hover:bg-bg" onClick={openCreateModal}>
            Add Item
          </button>
        }
      />

      <AlertStrip items={inventoryOverview.items} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {inventoryOverview.stats.map((stat) => (
          <StatCard key={stat.id} label={stat.label} value={stat.value} />
        ))}
      </div>

      <SectionCard title="All Inventory Items" subtitle={`${sourceItems.length} items`}>
        <div className="space-y-3">
          <div className="grid items-end gap-2 lg:grid-cols-[minmax(0,2.4fr),repeat(3,minmax(0,1fr))]">
            <SearchInput value={search} onChange={setSearch} placeholder="Search items, SKU, location..." />
            <FilterSelect
              value={status}
              onChange={setStatus}
              options={[
                { label: 'Status: All', value: 'ALL' },
                { label: 'Status: OK', value: 'OK' },
                { label: 'Status: Low', value: 'LOW' },
              ]}
            />
            <FilterSelect value={zone} onChange={setZone} options={locationOptions} />
            <FilterSelect
              value={sortBy}
              onChange={setSortBy}
              options={[
                { label: 'Sort: Name', value: 'NAME' },
                { label: 'Sort: Quantity', value: 'QTY' },
              ]}
            />
          </div>

          <Tabs tabs={inventoryOverview.tabs} activeTab={activeTab} onChange={setActiveTab} />

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-muted">
                <tr className="border-b border-border">
                  <th className="pb-2 font-medium">Material / SKU</th>
                  <th className="pb-2 font-medium">Category</th>
                  <th className="pb-2 text-right font-medium">Qty</th>
                  <th className="pb-2 font-medium">Prod.</th>
                  <th className="pb-2 font-medium">Location</th>
                  <th className="pb-2 font-medium">Status</th>
                  <th className="pb-2 font-medium">Edit</th>
                  <th className="pb-2 font-medium">View</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item, index) => {
                  const itemId = Number(item.id);
                  const isExpanded = expandedViewRowKey === inventoryRowKey(item);
                  const uniqueRowKey = `${item.id}-${item.location || 'none'}-${index}`;

                  return (
                    <React.Fragment key={uniqueRowKey}>
                      <tr className={`border-b border-border/70 ${isExpanded ? 'bg-bg/30' : ''}`}>
                        <td className="py-2.5 pr-3">
                          <p className="font-semibold text-text">{item.name}</p>
                          <p className="text-xs text-muted">{item.sku}</p>
                        </td>
                        <td className="py-2.5 pr-3 text-muted">{item.category}</td>
                        <td className="py-2.5 pr-3 text-right font-semibold text-text">{item.quantity}</td>
                        <td className="py-2.5 pr-3">
                          <p className="text-xs text-muted">{item.productionTime} min</p>
                        </td>
                        <td className="inventory-location-cell py-2.5 pr-3 text-muted">{item.location}</td>
                        <td className="py-2.5 pr-3">
                          <StatusBadge status={item.status} />
                        </td>
                        <td className="py-2.5 pr-3">
                          <button
                            type="button"
                            className="icon-action-button"
                            aria-label={`Edit ${item.name}`}
                            onClick={() => handleEditClick(item)}
                          >
                            <img src={editIcon} alt="" aria-hidden="true" className="icon-action-button-icon" />
                            <span className="sr-only">Edit</span>
                          </button>
                        </td>
                        <td className="py-2.5">
                          <button
                            type="button"
                            className={`icon-action-button ${isExpanded ? 'border-primary bg-bg text-text' : ''}`}
                            aria-label={`View ${item.name}`}
                            aria-controls={`inventory-details-${item.id}`}
                            aria-expanded={isExpanded}
                            onClick={() => {
                              void handleViewClick(item);
                            }}
                          >
                            <img src={viewIcon} alt="" aria-hidden="true" className="icon-action-button-icon" />
                            <span className="sr-only">View</span>
                          </button>
                        </td>
                      </tr>

                      {isExpanded ? (
                        <tr className="border-b border-border/70 bg-app/60">
                          <td colSpan={8} className="px-0 py-3">
                            <div id={`inventory-details-${item.id}`} className="inventory-view-details px-0 sm:px-1">
                              <InventoryMaterialsPopover
                                loading={loadingMaterialItemId === itemId && materialDetailsById[itemId] === undefined}
                                details={materialDetailsById[itemId] ?? null}
                                compact
                              />
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>

            {filteredItems.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted">No items match your current filters.</p>
            ) : null}
          </div>
          <InventoryItemEditModal
            item={editingRow != null
              ? sourceItems.find((candidate) => Number(candidate.id) === editingRow.itemId && candidate.branchId === editingRow.branchId) ?? null
              : null}
            open={editingRow != null}
            saving={editingRow != null && savingEditItemId === editingRow.itemId}
            onClose={closeEditModal}
            onSave={handleSaveEdit}
            categoryOptions={categoryOptions}
          />

          <InventoryItemCreateModal
            open={createItemOpen}
            saving={creatingItem}
            categoryOptions={categoryOptions}
            onClose={closeCreateModal}
            onCreate={handleCreateItem}
          />

          <InventoryItemIngredientModal
            item={ingredientItem}
            open={ingredientItem != null}
            onClose={closeIngredientModal}
          />
        </div>
      </SectionCard>
    </div>
  );
}

export default InventoryPage;