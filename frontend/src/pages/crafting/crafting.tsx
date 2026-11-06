import React, { FC, useEffect, useState } from 'react';
import './crafting.css';
import AlertStrip from '../../components/layout/AlertStrip';
import PageHeader from '../../components/layout/PageHeader';
import CraftingNav from './components/craftingNav/craftingNav';
import StatsGrid from './components/stats/stats';
import HistoryStats from './components/historyStats/historyStats';
import HistoryPanel from './components/historyPanel/historyPanel';
import CraftingItems from './components/craftingItems/craftingItems';
import CraftingQueue from './components/craftingQueue/craftingQueue';
import CraftPanel from './components/craftPanel/craftPanel';
import BlueprintPanel from './components/blueprintPanel/blueprintPanel';
import NewBlueprint from './components/newBlueprint/newBlueprint';
import BlueprintEdit from './components/blueprintEdit/BlueprintEdit';
import { useApi } from '../../hooks';
import { showError, showSuccess } from '../../utils/toast';
import { getInventoryOverview, type InventoryItem } from '../../services/inventoryApi';
import { Blueprint } from './components/craftingData';
import { getCurrentDateSAST } from '../../Date/dateUtils';
import { useCurrentUser } from '../../utils/currentUser';

interface PageProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

const ActiveJobsPage: FC = () => (
  <div className="crafting-panel">
    <StatsGrid />
  </div>
);

const ActiveJobsContent: FC = () => (
  <div className="crafting-panel">
    <div className="active-jobs-layout">
      <div className="active-jobs-main">
        <CraftingItems />
      </div>
      <div className="active-jobs-sidebar">
        <CraftingQueue />
      </div>
    </div>
  </div>
);

interface CraftPageProps {
  selectedBlueprintId: string;
  selectedBlueprint: Blueprint | null;
  amount: number;
  orderExpedite: boolean;
  filter: string;
  onFilterChange: (filter: string) => void;
  onSelectBlueprint: (blueprintId: string) => void;
  onAmountChange: (amount: number) => void;
  onToggleExpedite: () => void;
  onCraft: () => Promise<void>;
  onEditBlueprint: () => void;
  onDeleteBlueprint: () => void;
  blueprintRefreshKey: number;
}

const CraftPage: FC<PageProps & CraftPageProps> = ({
  activeTab,
  onTabChange,
  selectedBlueprintId,
  selectedBlueprint,
  amount,
  orderExpedite,
  filter,
  onFilterChange,
  onSelectBlueprint,
  onAmountChange,
  onToggleExpedite,
  onCraft,
  onEditBlueprint,
  onDeleteBlueprint,
  blueprintRefreshKey,
}) => {
  if (!selectedBlueprint) {
    return (
      <div className="crafting-panel">
        <HistoryStats />
        <CraftingNav
          activeTab={activeTab}
          onTabChange={onTabChange}
          onCreateBlueprint={() => onTabChange('new')}
        />
        <div className="active-jobs-layout">
          <div className="active-jobs-main">
            <div className="craft-panel-card">
              <div className="craft-panel-header">
                <h3>Crafting</h3>
              </div>
              <div className="craft-panel-selected">
                <span className="craft-panel-label">SELECT BLUEPRINT</span>
                <h4>No Blueprint Selected</h4>
                <p style={{ color: 'var(--muted)', marginTop: '8px' }}>
                  Select a blueprint from the list to begin crafting
                </p>
              </div>
            </div>
          </div>
          <div className="active-jobs-sidebar">
            <BlueprintPanel
              selectedBlueprintId={selectedBlueprintId}
              filter={filter}
              onFilterChange={onFilterChange}
              onSelectBlueprint={onSelectBlueprint}
              onCreateBlueprint={() => onTabChange('new')}
              refreshKey={blueprintRefreshKey}
            />
            <CraftingQueue />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="crafting-panel">
      <HistoryStats />
      <CraftingNav
        activeTab={activeTab}
        onTabChange={onTabChange}
        onCreateBlueprint={() => onTabChange('new')}
      />
      <div className="active-jobs-layout">
        <div className="active-jobs-main">
          <CraftPanel
            blueprint={selectedBlueprint}
            amount={amount}
            orderExpedite={orderExpedite}
            onAmountChange={onAmountChange}
            onToggleExpedite={onToggleExpedite}
            onCraft={onCraft}
            onEdit={onEditBlueprint}
            onDelete={onDeleteBlueprint}
          />
        </div>
        <div className="active-jobs-sidebar">
          <BlueprintPanel
            selectedBlueprintId={selectedBlueprintId}
            filter={filter}
            onFilterChange={onFilterChange}
            onSelectBlueprint={onSelectBlueprint}
            onCreateBlueprint={() => onTabChange('new')}
            refreshKey={blueprintRefreshKey}
          />
          <CraftingQueue />
        </div>
      </div>
    </div>
  );
};

const HistoryPage: FC<PageProps> = ({ activeTab, onTabChange }) => (
  <div className="crafting-panel">
    <HistoryStats />
    <CraftingNav
      activeTab={activeTab}
      onTabChange={onTabChange}
      onCreateBlueprint={() => onTabChange('new')}
    />
    <HistoryPanel />
  </div>
);

const NewBlueprintPage: FC<PageProps & { onCancel: () => void }> = ({ activeTab, onTabChange, onCancel }) => (
  <div className="crafting-panel">
    <HistoryStats />
    <CraftingNav
      activeTab={activeTab}
      onTabChange={onTabChange}
      onCreateBlueprint={() => onTabChange('new')}
    />
    <div className="new-blueprint-page">
      <NewBlueprint onCancel={onCancel} />
    </div>
  </div>
);

const BlueprintEditPage: FC<PageProps & { itemId: number | null; onCancel: () => void; onSaved: () => void }> = ({ activeTab, onTabChange, itemId, onCancel, onSaved }) => {
  if (!itemId) return null;

  return (
    <div className="crafting-panel">
      <HistoryStats />
      <CraftingNav
        activeTab={activeTab}
        onTabChange={onTabChange}
        onCreateBlueprint={() => onTabChange('new')}
      />
      <div className="new-blueprint-page">
        <BlueprintEdit itemId={itemId} onCancel={onCancel} onSaved={onSaved} />
      </div>
    </div>
  );
};

const Crafting: FC = () => {
  const [activeTab, setActiveTab] = useState<string>('active');
  const [selectedBlueprintId, setSelectedBlueprintId] = useState<string>('');
  const [selectedBlueprint, setSelectedBlueprint] = useState<Blueprint | null>(null);
  const [amount, setAmount] = useState<number>(1);
  const [orderExpedite, setOrderExpedite] = useState<boolean>(false);
  const [filter, setFilter] = useState<string>('all');
  const [editItemId, setEditItemId] = useState<number | null>(null);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [blueprintRefreshKey, setBlueprintRefreshKey] = useState<number>(0);
  const api = useApi();
  const currentUser = useCurrentUser();
  const currentBranchId = currentUser?.branchId;
  const currentDate = getCurrentDateSAST();

  const handleSelectBlueprint = async (blueprintId: string) => {
    setSelectedBlueprintId(blueprintId);
    setAmount(1);
    const itemId = parseInt(blueprintId.replace('bp-', ''));

    try {
      const [itemResponse, ingredientsResponse] = await Promise.all([
        api.get(`/Item/item/${itemId}`),
        api.get(`/Item/itemIngredient/item/${itemId}`),
      ]);
      const branchResp = await api.get(currentBranchId != null ? `/Item/Branch/${currentBranchId}` : '/Item/Branch');
      const itemsResp = await api.get('/Item/item');

      if (itemResponse.data && ingredientsResponse.data) {
        const item = itemResponse.data;
        const ingredients = ingredientsResponse.data;
        const allItems = itemsResp.data;

        const itemById: Record<number, any> = {};
        allItems.forEach((it: any) => {
          const id = Number(it.ItemID ?? it.itemID ?? it.itemId ?? 0);
          if (id) itemById[id] = it;
        });

        let inventoryMap: Record<number, number> = {};
        try {
          if (branchResp.data) {
            const branchItems = branchResp.data;
            branchItems.forEach((bic: any) => {
              const itemKey = Number(bic.ItemID ?? bic.itemID ?? bic.itemId ?? 0);
              const quantity = Number(bic.ItemQuantity ?? bic.itemQuantity ?? 0);
              if (!itemKey) return;
              inventoryMap[itemKey] = (inventoryMap[itemKey] || 0) + quantity;
            });
          }
        } catch (e) {
          console.error('Error fetching inventory for blueprint:', e);
        }

        const blueprintItemId = Number(item.itemID ?? item.ItemID ?? 0);
        const blueprintInfo = itemById[blueprintItemId];
        const blueprint: Blueprint = {
          id: `bp-${blueprintItemId}`,
          name: blueprintInfo?.ItemName ?? item.itemName,
          description: `Production time: ${blueprintInfo?.ProductionTime ?? item.productionTime}s`,
          category: (blueprintInfo?.ItemCategory ?? item.itemCategory ?? 'mechanical').toString().toLowerCase() as any,
          have: inventoryMap[blueprintItemId] ?? 0,
          craft: 0,
          productionTime: item.productionTime,
          materials: ingredients.map((ing: any) => {
            const ingredientId = Number(ing.ingredientID ?? ing.IngredientID ?? ing.itemID ?? ing.itemId ?? 0);
            const ingredientInfo = itemById[ingredientId];
            return {
              itemId: ingredientId || undefined,
              name: ingredientInfo?.ItemName ?? ing.itemName ?? `Item ${ingredientId}`,
              need: Number(ing.quantity ?? 0),
              have: ingredientId ? inventoryMap[ingredientId] ?? 0 : 0,
            };
          }),
        };

        setSelectedBlueprint(blueprint);
      }
    } catch (err) {
      console.error('Error fetching selected blueprint:', err);
    }
  };

  const handleCraft = async (): Promise<void> => {
    if (!selectedBlueprint || !selectedBlueprintId) return;

    const itemId = parseInt(selectedBlueprintId.replace('bp-', ''), 10);
    if (Number.isNaN(itemId)) {
      console.error('Invalid blueprint item id');
      return;
    }

    if (currentUser?.branchId === 3) {
      showError(
        'Branch 3 is a virtual branch and cannot craft directly. Please switch to branch 1 or 2 to craft.'
      );
      return;
    }

    try {
      const branchID = currentUser?.branchId ?? 1;
      const employeeID = currentUser?.employeeId ?? 1;

      await api.post('/Order/create', {
        itemID: itemId,
        quantity: amount,
        branchID,
        employeeID,
        orderExpedite,
      });

      const branchItemsResp = await api.get(`/Item/Branch/${branchID}`);
      const branchItems = branchItemsResp.data;

      const branchQuantityByItemId = branchItems.reduce((map: Record<number, number>, bic: any) => {
        const id = bic.ItemID ?? bic.itemID ?? bic.itemId ?? 0;
        if (!id) return map;
        map[id] = (map[id] || 0) + (bic.ItemQuantity || bic.itemQuantity || 0);
        return map;
      }, {} as Record<number, number>);

      const updateResults = await Promise.allSettled(
        selectedBlueprint.materials.map(async (material) => {
          const materialItemId = material.itemId;
          if (!materialItemId) {
            return;
          }

          const currentMaterialQuantity = branchQuantityByItemId[materialItemId] ?? 0;
          const updatedQuantity = Math.max(0, currentMaterialQuantity - (material.need * amount));
          await api.put(
            `/Item/Branch/${branchID}/Item/${materialItemId}`,
            null,
            { params: { quantity: updatedQuantity } },
          );
        }),
      );

      const failedUpdates = updateResults.filter((result) => result.status === 'rejected');
      if (failedUpdates.length > 0) {
        console.error('Some branch inventory updates failed', failedUpdates);
        showError('Craft order created, but updating some branch item quantities failed.');
      } else {
        showSuccess('Craft order submitted successfully and inventory updated.');
      }

      setBlueprintRefreshKey((prev) => prev + 1);

      setSelectedBlueprint((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          materials: prev.materials.map((material) => ({
            ...material,
            have: Math.max(0, material.have - (material.need * amount)),
          })),
        };
      });
    } catch (error) {
      console.error('Failed to create craft order', error);
      showError('Unable to place craft order. Please try again.');
    }
  };

  const handleEditBlueprint = (): void => {
    if (!selectedBlueprintId) {
      return;
    }

    const itemId = parseInt(selectedBlueprintId.replace('bp-', ''));
    setEditItemId(itemId);
    setActiveTab('edit');
  };

  const handleDeleteBlueprint = async (): Promise<void> => {
    if (!selectedBlueprintId) {
      return;
    }

    const itemId = parseInt(selectedBlueprintId.replace('bp-', ''));
    const confirmed = window.confirm('Delete this blueprint and item? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      await api.delete(`/Item/${itemId}`);
      showSuccess('Blueprint deleted successfully.');
      setSelectedBlueprint(null);
      setSelectedBlueprintId('');
      setAmount(1);
      setActiveTab('active');
      setBlueprintRefreshKey((prev) => prev + 1);
    } catch (error) {
      console.error('Error deleting blueprint:', error);
      showError('Unable to delete blueprint. Please try again.');
    }
  };

  useEffect(() => {
    const loadLowStock = async (): Promise<void> => {
      try {
        const overview = await getInventoryOverview();
        setInventoryItems(overview.items);
      } catch (error) {
        console.error('Failed to load low stock alerts', error);
      }
    };

    void loadLowStock();
  }, []);

  return (
    <div className="page-content">
      <div className="space-y-4 sm:space-y-5">
        <PageHeader
          title="Crafting Management"
          subtitle={`Crafting Dashboard · ${currentDate}`}
        />
        <AlertStrip items={inventoryItems} />

        <div className="crafting-page">
          {activeTab === 'active' && <ActiveJobsPage />}
          {activeTab === 'history' && <HistoryPage activeTab={activeTab} onTabChange={setActiveTab} />}
          {activeTab === 'craft' && (
            <CraftPage
              activeTab={activeTab}
              onTabChange={setActiveTab}
              selectedBlueprintId={selectedBlueprintId}
              selectedBlueprint={selectedBlueprint}
              amount={amount}
              orderExpedite={orderExpedite}
              filter={filter}
              onFilterChange={setFilter}
              onSelectBlueprint={handleSelectBlueprint}
              onAmountChange={setAmount}
              onToggleExpedite={() => setOrderExpedite((prev) => !prev)}
              onCraft={handleCraft}
              onEditBlueprint={handleEditBlueprint}
              onDeleteBlueprint={handleDeleteBlueprint}
              blueprintRefreshKey={blueprintRefreshKey}
            />
          )}
          {activeTab === 'new' && (
            <NewBlueprintPage
              activeTab={activeTab}
              onTabChange={setActiveTab}
              onCancel={() => setActiveTab('active')}
            />
          )}
          {activeTab === 'edit' && (
            <BlueprintEditPage
              activeTab={activeTab}
              onTabChange={setActiveTab}
              itemId={editItemId}
              onCancel={() => setActiveTab('craft')}
              onSaved={() => {
                setActiveTab('craft');
                if (selectedBlueprintId) {
                  handleSelectBlueprint(selectedBlueprintId);
                }
              }}
            />
          )}
          {activeTab === 'active' && <CraftingNav activeTab={activeTab} onTabChange={setActiveTab} onCreateBlueprint={() => setActiveTab('new')} />}
          {activeTab === 'active' && <ActiveJobsContent />}
        </div>
      </div>
    </div>
  );
};

export default Crafting;
