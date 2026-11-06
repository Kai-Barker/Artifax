// Shared mock backend data for tests, in the JSON shapes the ASP.NET API returns (camelCase).
// Mirrors a small slice of Backend/Data/SeedData.sql so tests read like the real app.

export const branchesFixture = [
  { branchID: 1, branchName: 'Main Branch' },
  { branchID: 2, branchName: 'Johannesburg Fabrication Plant' },
  { branchID: 3, branchName: 'Durban Assembly Plant' },
];

export const usersFixture = [
  { employeeId: 1, employeeName: 'Naledi Dlamini', employeeEmail: 'naledi.dlamini@artifax.demo', branchId: 1 },
  { employeeId: 2, employeeName: 'Thandi Mokoena', employeeEmail: 'thandi.mokoena@artifax.demo', branchId: 2 },
  { employeeId: 3, employeeName: 'Sipho Ndlovu', employeeEmail: 'sipho.ndlovu@artifax.demo', branchId: 3 },
];

/** Rows from GET Item/item/allInventoryItems (one per item per branch). */
export const inventoryRowsFixture = [
  { inventoryItemId: 20, inventoryItemName: 'Emergency Stop Button', inventoryItemCategory: 'Electronics', inventoryItemProductionTime: 2, inventoryItemQuantity: 2, inventoryItemPrice: 260, inventoryItemBranchName: 'Main Branch', inventoryItemBranchId: 1 },
  { inventoryItemId: 20, inventoryItemName: 'Emergency Stop Button', inventoryItemCategory: 'Electronics', inventoryItemProductionTime: 2, inventoryItemQuantity: 4, inventoryItemPrice: 260, inventoryItemBranchName: 'Durban Assembly Plant', inventoryItemBranchId: 3 },
  { inventoryItemId: 1, inventoryItemName: 'Steel Sheet 2mm', inventoryItemCategory: 'Metals', inventoryItemProductionTime: 3, inventoryItemQuantity: 140, inventoryItemPrice: 450, inventoryItemBranchName: 'Main Branch', inventoryItemBranchId: 1 },
  { inventoryItemId: 6, inventoryItemName: 'Hex Bolt M10', inventoryItemCategory: 'Fasteners', inventoryItemProductionTime: 1, inventoryItemQuantity: 4800, inventoryItemPrice: 2.5, inventoryItemBranchName: 'Main Branch', inventoryItemBranchId: 1 },
  { inventoryItemId: 30, inventoryItemName: 'Steel Workbench 1800mm', inventoryItemCategory: 'Furniture', inventoryItemProductionTime: 45, inventoryItemQuantity: 14, inventoryItemPrice: 8900, inventoryItemBranchName: 'Main Branch', inventoryItemBranchId: 1 },
];

/**
 * Items from GET Item/item/ in PascalCase. The live API sends camelCase (itemID, itemName…);
 * the services accept both, and tests for code that only reads camelCase use camelCase rows.
 */
export const itemsFixture = [
  { ItemID: 1, ItemName: 'Steel Sheet 2mm', ItemCategory: 'Metals', ProductionTime: 3, Price: 450 },
  { ItemID: 6, ItemName: 'Hex Bolt M10', ItemCategory: 'Fasteners', ProductionTime: 1, Price: 2.5 },
  { ItemID: 20, ItemName: 'Emergency Stop Button', ItemCategory: 'Electronics', ProductionTime: 2, Price: 260 },
  { ItemID: 30, ItemName: 'Steel Workbench 1800mm', ItemCategory: 'Furniture', ProductionTime: 45, Price: 8900 },
];

/** Blueprint for item 30 from GET Item/itemIngredient/item/30. */
export const workbenchBlueprintFixture = [
  { ingredientID: 1, itemName: 'Steel Sheet 2mm', itemCategory: 'Metals', quantity: 2 },
  { ingredientID: 6, itemName: 'Hex Bolt M10', itemCategory: 'Fasteners', quantity: 16 },
];

/** Orders from GET Order. */
export const ordersFixture = [
  { orderID: 101, itemID: 30, itemName: 'Steel Workbench 1800mm', quantity: 2, createdDateTime: '2026-11-01T08:00:00Z', totalTime: 90, timeElapsed: 45, status: 'Active', branchID: 1, employeeID: 1, orderExpedite: false, queuePosition: null },
  { orderID: 102, itemID: 30, itemName: 'Steel Workbench 1800mm', quantity: 1, createdDateTime: '2026-11-01T09:00:00Z', totalTime: 45, timeElapsed: 10, status: 'Paused', branchID: 1, employeeID: 1, orderExpedite: false, queuePosition: null },
  { orderID: 103, itemID: 20, itemName: 'Emergency Stop Button', quantity: 5, createdDateTime: '2026-11-01T10:00:00Z', totalTime: 10, timeElapsed: 0, status: 'Queued', branchID: 1, employeeID: 1, orderExpedite: false, queuePosition: 1 },
  { orderID: 104, itemID: 6, itemName: 'Hex Bolt M10', quantity: 50, createdDateTime: '2026-11-01T11:00:00Z', totalTime: 50, timeElapsed: 0, status: 'Queued', branchID: 1, employeeID: 1, orderExpedite: true, queuePosition: 2 },
  { orderID: 105, itemID: 1, itemName: 'Steel Sheet 2mm', quantity: 3, createdDateTime: '2026-10-20T07:00:00Z', totalTime: 9, timeElapsed: 9, status: 'Complete', branchID: 2, employeeID: 2, orderExpedite: false, queuePosition: null },
];

/** Logged-in user as stored by utils/currentUser (localStorage). */
export const adminUser = { name: 'Naledi Dlamini', role: 'Admin', email: 'naledi.dlamini@artifax.demo', employeeId: 1, branchId: 1, branchName: 'Main Branch' };

export function signIn(user: Record<string, unknown> = adminUser): void {
  window.localStorage.setItem('artifax.currentUser', JSON.stringify(user));
}
