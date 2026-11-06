import axios from 'axios';
import { api as apiClient } from '../hooks/useApi';

function toFetchStyleError(error: unknown): Error {
  if (axios.isAxiosError(error)) {
    const status = error.response?.status;
    const statusText = error.response?.statusText;

    if (status != null) {
      return new Error(`Fetch error ${status} ${statusText ?? ''}`.trim());
    }

    if (error.message) {
      return new Error(error.message);
    }
  }

  if (error instanceof Error) {
    return error;
  }

  return new Error('Request failed');
}

const DEFAULT_MIN_STOCK = 5;

type ItemDto = { ItemID: number; ItemName: string; ItemCategory: string; ProductionTime: number; Price?: number | null };
type BranchDto = { BranchID: number; BranchName: string };
type BranchItemCapacityDto = { BranchItemCapacityID: number; BranchID: number; ItemID: number; ItemQuantity: number };
type InventoryRowDto = {
  inventoryItemId: number;
  inventoryItemName: string;
  inventoryItemCategory: string;
  inventoryItemProductionTime: number;
  inventoryItemQuantity: number;
  inventoryItemPrice?: number | null;
  inventoryItemBranchName: string;
  inventoryItemBranchId: number;
};

type IngredientBlueprintDto = {
  ingredientID: number;
  itemName: string;
  itemCategory: string;
  quantity: number;
};

async function fetchJson<T>(url: string): Promise<T> {
  try {
    const response = await apiClient.get<T>(url);
    return response.data;
  } catch (error) {
    throw toFetchStyleError(error);
  }
}

function normalizeItemDto(row: Record<string, unknown>): ItemDto {
  return {
    ItemID: Number(row.ItemID ?? row.itemID ?? row.itemId ?? 0),
    ItemName: String(row.ItemName ?? row.itemName ?? ''),
    ItemCategory: String(row.ItemCategory ?? row.itemCategory ?? ''),
    ProductionTime: Number(row.ProductionTime ?? row.productionTime ?? 0),
    Price: row.Price == null && row.price == null ? null : Number(row.Price ?? row.price ?? 0),
  };
}

export async function getItems(): Promise<ItemDto[]> {
  const rows = await fetchJson<Array<Record<string, unknown>>>('Item/item/');
  return rows.map(normalizeItemDto);
}

export function getItemCategoryOptions(items: ItemDto[]): string[] {
  return Array.from(
    new Set(
      items
        .map((item) => item.ItemCategory.trim())
        .filter((category) => category.length > 0),
    ),
  ).sort((left, right) => left.localeCompare(right));
}

export async function getBranchItems(): Promise<BranchItemCapacityDto[]> {
  return fetchJson<BranchItemCapacityDto[]>('Item/Branch');
}

export async function getBranches(): Promise<BranchDto[]> {
  return fetchJson<BranchDto[]>('Branch');
}

export type InventoryItemUpdate = {
  itemName: string;
  itemCategory: string;
  productionTime: number;
  price: number | null;
  quantity: number;
  branchId: number;
};

export type InventoryItemCreate = {
  itemName: string;
  itemCategory: string;
  productionTime: number;
  price: number | null;
};

export type InventoryCreatedItem = {
  itemID: number;
  itemName: string;
  itemCategory: string;
  productionTime: number;
};

export type InventoryItemIngredientCreate = {
  productID: number;
  ingredientID: number;
  ingredientQuantity: number;
};

export type DashboardPreviewRow = { id: string; name: string; qty: number; location: string; status: string };

export type InventoryStat = {
  id: string;
  label: string;
  value: string | number;
};

export type InventoryTab = {
  id: string;
  label: string;
};

type InventoryCategoryDefinition = {
  label: string;
  aliases: string[];
};

const INVENTORY_CATEGORY_DEFINITIONS: InventoryCategoryDefinition[] = [
  { label: 'Furniture', aliases: ['furniture'] },
  { label: 'Stationery', aliases: ['stationery'] },
  { label: 'Metals', aliases: ['metal', 'metals'] },
  { label: 'Fasteners', aliases: ['fastener', 'fasteners'] },
  { label: 'Plastic', aliases: ['plastic', 'plastics', 'polymer', 'polymers'] },
  { label: 'Electronics', aliases: ['electronics', 'electronic'] },
  { label: 'Textile', aliases: ['textile', 'textiles', 'fabric', 'fabrics'] },
  { label: 'Glass', aliases: ['glass'] },
  { label: 'Others', aliases: ['other', 'others', 'misc', 'miscellaneous', 'uncategorized'] },
];

export type InventoryOverview = {
  items: InventoryItem[];
  previewRows: DashboardPreviewRow[];
  alerts: string[];
  stats: InventoryStat[];
  tabs: InventoryTab[];
};

export type InventoryMaterialBranch = {
  branchName: string;
  quantity: number;
};

export type InventoryMaterialIngredient = {
  ingredientId: number;
  name: string;
  category: string;
  requiredQuantity: number;
  availableQuantity: number;
  branches: InventoryMaterialBranch[];
};

export type InventoryMaterialDetails = {
  itemId: number;
  itemName: string;
  category: string;
  productionTime: number;
  ingredients: InventoryMaterialIngredient[];
};

function slugifyCategory(category: string): string {
  return category.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'misc';
}

function normalizeCategoryKey(category: string | null | undefined): string {
  return normalizeCategory(category).trim().toLowerCase();
}

function normalizeCategory(category: string | null | undefined): string {
  return category?.trim() || 'Misc';
}

function normalizeLocation(location: string | null | undefined): string {
  return location?.trim() || 'Unassigned';
}

function normalizeMaterialBranchRows(rows: InventoryRowDto[], ingredientId: number): InventoryMaterialBranch[] {
  const branchMap = new Map<string, number>();

  rows
    .filter((row) => row.inventoryItemId === ingredientId)
    .forEach((row) => {
      const branchName = normalizeLocation(row.inventoryItemBranchName);
      branchMap.set(branchName, (branchMap.get(branchName) ?? 0) + (row.inventoryItemQuantity ?? 0));
    });

  return Array.from(branchMap.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([branchName, quantity]) => ({ branchName, quantity }));
}

export function buildInventoryOverview(items: InventoryItem[]): InventoryOverview {
  const categoryCounts = new Map<string, number>();
  const lowStockItems = items.filter((item) => item.status === 'LOW');

  items.forEach((item) => {
    const categoryKey = normalizeCategoryKey(item.category);
    categoryCounts.set(categoryKey, (categoryCounts.get(categoryKey) ?? 0) + 1);
  });

  const previewRows: DashboardPreviewRow[] = items.slice(0, 8).map((item) => ({
    id: item.id,
    name: item.name,
    qty: item.quantity,
    location: item.location,
    status: item.status,
  }));

  const tabs: InventoryTab[] = [
    { id: 'all', label: `All (${items.length})` },
    ...INVENTORY_CATEGORY_DEFINITIONS.map((definition) => {
      const count = definition.aliases.reduce((sum, alias) => sum + (categoryCounts.get(alias) ?? 0), 0);
      return {
        id: slugifyCategory(definition.label),
        label: `${definition.label} (${count})`,
      };
    }),
  ];

  const knownCategoryKeys = new Set(INVENTORY_CATEGORY_DEFINITIONS.flatMap((definition) => definition.aliases));
  const extraTabs = Array.from(categoryCounts.entries())
    .filter(([category]) => !knownCategoryKeys.has(category))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([category, count]) => ({
      id: slugifyCategory(category),
      label: `${category} (${count})`,
    }));

  tabs.push(...extraTabs);

  const alerts = lowStockItems.map((item) => `${item.name} (${item.quantity} remaining)`);
  const totalUnits = items.reduce((sum, item) => sum + item.quantity, 0);

  return {
    items,
    previewRows,
    alerts,
    stats: [
      { id: 'totalItems', label: 'Total Items', value: items.length },
      { id: 'lowStock', label: 'Low Stock', value: lowStockItems.length },
      { id: 'totalUnits', label: 'Total Units', value: totalUnits.toLocaleString('en-ZA') },
      { id: 'categories', label: 'Categories', value: tabs.length - 1 },
    ],
    tabs,
  };
}

export async function getDashboardPreview(): Promise<DashboardPreviewRow[]> {
  const overview = await getInventoryOverview();
  return overview.previewRows;
}

export async function getItemMaterialDetails(itemId: number): Promise<InventoryMaterialDetails | null> {
  const [itemResponse, ingredientResponse, inventoryRows] = await Promise.all([
    fetchJson<Record<string, unknown>>(`Item/item/${itemId}`).catch((error) => {
      if (String(error).includes('404')) {
        return null;
      }

      throw error;
    }),
    fetchJson<IngredientBlueprintDto[]>(`Item/itemIngredient/item/${itemId}`).catch((error) => {
      if (String(error).includes('404')) {
        return [];
      }

      throw error;
    }),
    fetchJson<InventoryRowDto[]>('Item/item/allInventoryItems'),
  ]);

  if (!itemResponse) {
    return null;
  }

  const ingredients: InventoryMaterialIngredient[] = ingredientResponse.map((ingredient) => {
    const branches = normalizeMaterialBranchRows(inventoryRows, ingredient.ingredientID);
    const availableQuantity = branches.reduce((sum, branch) => sum + branch.quantity, 0);

    return {
      ingredientId: ingredient.ingredientID,
      name: ingredient.itemName,
      category: normalizeCategory(ingredient.itemCategory),
      requiredQuantity: ingredient.quantity,
      availableQuantity,
      branches,
    };
  });

  return {
    itemId: Number(itemResponse.ItemID ?? itemResponse.itemID ?? itemResponse.itemId ?? itemId),
    itemName: String(itemResponse.ItemName ?? itemResponse.itemName ?? `Item ${itemId}`),
    category: normalizeCategory(String(itemResponse.ItemCategory ?? itemResponse.itemCategory ?? 'Misc')),
    productionTime: Number(itemResponse.ProductionTime ?? itemResponse.productionTime ?? 0),
    ingredients,
  };
}

export async function updateInventoryItem(
  itemId: number, 
  payload: InventoryItemUpdate & { branchId: number }
): Promise<void> {
  // Validate before sending anything, so an invalid save doesn't half-apply.
  if (payload.quantity < 0) {
    throw new Error('Quantity cannot be negative.');
  }
  if (!payload.branchId) {
    throw new Error(`Cannot update quantity: No branchId provided for item ${itemId}.`);
  }

  try {
    await apiClient.put(`Item/${itemId}`, {
      itemName: payload.itemName,
      itemCategory: payload.itemCategory,
      productionTime: payload.productionTime,
      price: payload.price,
    });
    await apiClient.put(`Item/Branch/${payload.branchId}/Item/${itemId}`, null, {
      params: { quantity: payload.quantity },
    });

  } catch (error) {
    throw toFetchStyleError(error);
  }
}

export async function createInventoryItem(payload: InventoryItemCreate): Promise<InventoryCreatedItem> {
  let body: Record<string, unknown>;

  try {
    const response = await apiClient.post<Record<string, unknown>>('Item/item/CreateItemDefaultQuantity', {
      itemName: payload.itemName,
      itemCategory: payload.itemCategory,
      productionTime: payload.productionTime,
      price: payload.price,
    });
    body = response.data;
  } catch (error) {
    throw toFetchStyleError(error);
  }

  return {
    itemID: Number(body.itemID ?? body.ItemID ?? 0),
    itemName: String(body.itemName ?? body.ItemName ?? payload.itemName),
    itemCategory: String(body.itemCategory ?? body.ItemCategory ?? payload.itemCategory),
    productionTime: Number(body.productionTime ?? body.ProductionTime ?? payload.productionTime),
  };
}

export async function createInventoryItemIngredient(payload: InventoryItemIngredientCreate): Promise<void> {
  try {
    await apiClient.post('Item/itemIngredient/', {
      ProductID: payload.productID,
      IngredientID: payload.ingredientID,
      IngredientQuantity: payload.ingredientQuantity,
    });
  } catch (error) {
    throw toFetchStyleError(error);
  }
}

export type InventoryItem = {
  id: string;
  name: string;
  sku: string;
  category: string;
  quantity: number;
  price: number | null;
  minStock: number;
  location: string;
  branchId: number;
  status: string;
  productionTime: number;
  tab?: string;
};

export async function getInventoryItems(): Promise<InventoryItem[]> {
  const rows = await fetchJson<InventoryRowDto[]>('Item/item/allInventoryItems');
  const items: InventoryItem[] = rows.map((r) => {
    const id = r.inventoryItemId;
    const category = normalizeCategory(r.inventoryItemCategory);
    const name = r.inventoryItemName || `Item ${id}`;
    const sku = `${category.slice(0, 3).toUpperCase()}-${id}`;
    const qty = r.inventoryItemQuantity ?? 0;
    const loc = normalizeLocation(r.inventoryItemBranchName);
    const branchId = r.inventoryItemBranchId;
    
    const minStock = DEFAULT_MIN_STOCK;
    const status = qty <= minStock ? 'LOW' : 'OK';

    return {
      id: String(id),
      name,
      sku,
      category,
      quantity: qty,
      price: r.inventoryItemPrice == null ? null : Number(r.inventoryItemPrice),
      minStock,
      location: loc,
      branchId,
      status,
      productionTime: r.inventoryItemProductionTime ?? 0,
      tab: slugifyCategory(category),
    };
  });

  return items.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getInventoryOverview(): Promise<InventoryOverview> {
  const items = await getInventoryItems();
  return buildInventoryOverview(items);
}

const inventoryApi = {
  getItems,
  getBranchItems,
  getBranches,
  getDashboardPreview,
  getItemMaterialDetails,
  getItemCategoryOptions,
  getInventoryItems,
  getInventoryOverview,
  createInventoryItem,
  createInventoryItemIngredient,
  updateInventoryItem,
  buildInventoryOverview,
};

export default inventoryApi;
