import inventoryApi, {
  buildInventoryOverview,
  createInventoryItem,
  createInventoryItemIngredient,
  getBranches,
  getBranchItems,
  getDashboardPreview,
  getInventoryItems,
  getInventoryOverview,
  getItemCategoryOptions,
  getItemMaterialDetails,
  getItems,
  updateInventoryItem,
} from '../inventoryApi';
import { httpError, mockedAxios, mockGet, mockWritesSucceed, networkError } from '../../test-utils/http';
import { inventoryRowsFixture, itemsFixture, workbenchBlueprintFixture } from '../../test-utils/fixtures';

describe('inventoryApi', () => {
  describe('getInventoryItems', () => {
    it('maps each branch row to an inventory item, sorted by name, with LOW at 5 or fewer', async () => {
      mockGet({ 'Item/item/allInventoryItems': inventoryRowsFixture });

      const items = await getInventoryItems();

      expect(items.map((i) => i.name)).toEqual([
        'Emergency Stop Button',
        'Emergency Stop Button',
        'Hex Bolt M10',
        'Steel Sheet 2mm',
        'Steel Workbench 1800mm',
      ]);
      const durbanButton = items.find((i) => i.id === '20' && i.branchId === 3)!;
      expect(durbanButton).toMatchObject({
        sku: 'ELE-20',
        category: 'Electronics',
        quantity: 4,
        price: 260,
        location: 'Durban Assembly Plant',
        status: 'LOW',
        minStock: 5,
        productionTime: 2,
        tab: 'electronics',
      });
      expect(items.find((i) => i.id === '1')!.status).toBe('OK');
    });

    it('fills in defaults for incomplete rows', async () => {
      mockGet({
        'Item/item/allInventoryItems': [
          { inventoryItemId: 9, inventoryItemName: '', inventoryItemCategory: '  ', inventoryItemBranchName: '', inventoryItemBranchId: 1 },
        ],
      });

      const [item] = await getInventoryItems();

      expect(item).toMatchObject({
        name: 'Item 9',
        category: 'Misc',
        sku: 'MIS-9',
        quantity: 0,
        price: null,
        location: 'Unassigned',
        status: 'LOW',
        productionTime: 0,
        tab: 'misc',
      });
    });

    it('turns an HTTP failure into a readable error', async () => {
      mockGet({ 'Item/item/allInventoryItems': httpError(500, '', 'Internal Server Error') });

      await expect(getInventoryItems()).rejects.toThrow('Fetch error 500 Internal Server Error');
    });

    it('reports network failures with axios message', async () => {
      mockGet({ 'Item/item/allInventoryItems': networkError() });

      await expect(getInventoryItems()).rejects.toThrow('Network Error');
    });
  });

  describe('buildInventoryOverview', () => {
    it('builds alerts, stats, preview rows and category tabs from the items', async () => {
      mockGet({ 'Item/item/allInventoryItems': inventoryRowsFixture });

      const overview = await getInventoryOverview();

      expect(overview.alerts).toEqual(['Emergency Stop Button (2 remaining)', 'Emergency Stop Button (4 remaining)']);
      expect(overview.stats).toEqual([
        { id: 'totalItems', label: 'Total Items', value: 5 },
        { id: 'lowStock', label: 'Low Stock', value: 2 },
        { id: 'totalUnits', label: 'Total Units', value: (4960).toLocaleString('en-ZA') },
        { id: 'categories', label: 'Categories', value: 9 },
      ]);
      expect(overview.previewRows[0]).toEqual({ id: '20', name: 'Emergency Stop Button', qty: 2, location: 'Main Branch', status: 'LOW' });
      expect(overview.tabs).toContainEqual({ id: 'all', label: 'All (5)' });
      expect(overview.tabs).toContainEqual({ id: 'electronics', label: 'Electronics (2)' });
      expect(overview.tabs).toContainEqual({ id: 'metals', label: 'Metals (1)' });
      expect(overview.tabs).toContainEqual({ id: 'glass', label: 'Glass (0)' });
    });

    it('adds a tab for categories outside the known list', () => {
      const overview = buildInventoryOverview([
        { id: '1', name: 'Pump', sku: 'HYD-1', category: 'Hydraulics', quantity: 10, price: null, minStock: 5, location: 'Main Branch', branchId: 1, status: 'OK', productionTime: 1 },
        { id: '2', name: 'Valve', sku: 'AAA-2', category: 'Actuators', quantity: 1, price: null, minStock: 5, location: 'Main Branch', branchId: 1, status: 'LOW', productionTime: 1 },
      ]);

      const extra = overview.tabs.slice(-2);
      expect(extra).toEqual([
        { id: 'actuators', label: 'actuators (1)' },
        { id: 'hydraulics', label: 'hydraulics (1)' },
      ]);
      expect(overview.stats.find((s) => s.id === 'categories')!.value).toBe(11);
    });

    it('handles an empty inventory', () => {
      const overview = buildInventoryOverview([]);

      expect(overview.alerts).toEqual([]);
      expect(overview.previewRows).toEqual([]);
      expect(overview.tabs[0]).toEqual({ id: 'all', label: 'All (0)' });
      expect(overview.stats.find((s) => s.id === 'totalUnits')!.value).toBe('0');
    });

    it('limits the dashboard preview to 8 rows', async () => {
      const many = Array.from({ length: 10 }, (_, i) => ({ ...inventoryRowsFixture[2], inventoryItemId: i + 1, inventoryItemName: `Part ${String(i).padStart(2, '0')}` }));
      mockGet({ 'Item/item/allInventoryItems': many });

      const preview = await getDashboardPreview();

      expect(preview).toHaveLength(8);
      expect(preview[0].name).toBe('Part 00');
    });
  });

  describe('items, branches and categories', () => {
    it('normalises item rows regardless of property casing', async () => {
      mockGet({
        'Item/item/': [
          itemsFixture[0],
          { itemID: 7, itemName: 'Washer', itemCategory: 'Fasteners', productionTime: 1, price: 0.4 },
          { itemId: 8, itemName: 'Gasket', itemCategory: 'Others' },
          {},
        ],
      });

      const items = await getItems();

      expect(items).toEqual([
        { ItemID: 1, ItemName: 'Steel Sheet 2mm', ItemCategory: 'Metals', ProductionTime: 3, Price: 450 },
        { ItemID: 7, ItemName: 'Washer', ItemCategory: 'Fasteners', ProductionTime: 1, Price: 0.4 },
        { ItemID: 8, ItemName: 'Gasket', ItemCategory: 'Others', ProductionTime: 0, Price: null },
        { ItemID: 0, ItemName: '', ItemCategory: '', ProductionTime: 0, Price: null },
      ]);
    });

    it('lists unique, sorted, non-empty categories', () => {
      const options = getItemCategoryOptions([
        { ItemID: 1, ItemName: 'a', ItemCategory: ' Metals ', ProductionTime: 1 },
        { ItemID: 2, ItemName: 'b', ItemCategory: 'Fasteners', ProductionTime: 1 },
        { ItemID: 3, ItemName: 'c', ItemCategory: 'Metals', ProductionTime: 1 },
        { ItemID: 4, ItemName: 'd', ItemCategory: '   ', ProductionTime: 1 },
      ]);

      expect(options).toEqual(['Fasteners', 'Metals']);
    });

    it('fetches branches and branch stock rows', async () => {
      const stock = [{ BranchItemCapacityID: 1, BranchID: 1, ItemID: 1, ItemQuantity: 140 }];
      mockGet({ Branch: [{ BranchID: 1, BranchName: 'Main Branch' }], 'Item/Branch': stock });

      await expect(getBranches()).resolves.toEqual([{ BranchID: 1, BranchName: 'Main Branch' }]);
      await expect(getBranchItems()).resolves.toEqual(stock);
    });
  });

  describe('getItemMaterialDetails', () => {
    it('combines the item, its blueprint and stock per branch', async () => {
      mockGet({
        'Item/item/30': itemsFixture[3],
        'Item/itemIngredient/item/30': workbenchBlueprintFixture,
        'Item/item/allInventoryItems': [
          ...inventoryRowsFixture,
          { ...inventoryRowsFixture[2], inventoryItemQuantity: 10, inventoryItemBranchName: 'Durban Assembly Plant', inventoryItemBranchId: 3 },
        ],
      });

      const details = await getItemMaterialDetails(30);

      expect(details).toEqual({
        itemId: 30,
        itemName: 'Steel Workbench 1800mm',
        category: 'Furniture',
        productionTime: 45,
        ingredients: [
          {
            ingredientId: 1,
            name: 'Steel Sheet 2mm',
            category: 'Metals',
            requiredQuantity: 2,
            availableQuantity: 150,
            branches: [
              { branchName: 'Durban Assembly Plant', quantity: 10 },
              { branchName: 'Main Branch', quantity: 140 },
            ],
          },
          {
            ingredientId: 6,
            name: 'Hex Bolt M10',
            category: 'Fasteners',
            requiredQuantity: 16,
            availableQuantity: 4800,
            branches: [{ branchName: 'Main Branch', quantity: 4800 }],
          },
        ],
      });
    });

    it('accepts camelCase item fields and falls back when they are missing', async () => {
      mockGet({
        'Item/item/5': { itemId: 5 },
        'Item/itemIngredient/item/5': httpError(404, '', 'Not Found'),
        'Item/item/allInventoryItems': [],
      });

      const details = await getItemMaterialDetails(5);

      expect(details).toEqual({ itemId: 5, itemName: 'Item 5', category: 'Misc', productionTime: 0, ingredients: [] });
    });

    it('uses the requested id when the item has no id fields', async () => {
      mockGet({
        'Item/item/6': { itemName: 'Hex Bolt M10', itemCategory: 'Fasteners', productionTime: 1 },
        'Item/itemIngredient/item/6': [],
        'Item/item/allInventoryItems': [],
      });

      const details = await getItemMaterialDetails(6);

      expect(details).toMatchObject({ itemId: 6, itemName: 'Hex Bolt M10', category: 'Fasteners', productionTime: 1 });
    });

    it('returns null when the item does not exist (404)', async () => {
      mockGet({
        'Item/item/99': httpError(404, '', 'Not Found'),
        'Item/itemIngredient/item/99': httpError(404, '', 'Not Found'),
        'Item/item/allInventoryItems': [],
      });

      await expect(getItemMaterialDetails(99)).resolves.toBeNull();
    });

    it('rethrows other failures loading the item', async () => {
      mockGet({
        'Item/item/30': httpError(500, '', 'Server Error'),
        'Item/itemIngredient/item/30': [],
        'Item/item/allInventoryItems': [],
      });

      await expect(getItemMaterialDetails(30)).rejects.toThrow('Fetch error 500 Server Error');
    });

    it('rethrows other failures loading the blueprint', async () => {
      mockGet({
        'Item/item/30': itemsFixture[3],
        'Item/itemIngredient/item/30': httpError(503, '', 'Unavailable'),
        'Item/item/allInventoryItems': [],
      });

      await expect(getItemMaterialDetails(30)).rejects.toThrow('Fetch error 503 Unavailable');
    });
  });

  describe('updateInventoryItem', () => {
    const payload = { itemName: 'Hex Bolt M10', itemCategory: 'Fasteners', productionTime: 1, price: 2.5, quantity: 25, branchId: 3 };

    it('updates the item, then that branch’s quantity', async () => {
      mockWritesSucceed();

      await updateInventoryItem(6, payload);

      expect(mockedAxios.put).toHaveBeenNthCalledWith(1, 'Item/6', { itemName: 'Hex Bolt M10', itemCategory: 'Fasteners', productionTime: 1, price: 2.5 });
      expect(mockedAxios.put).toHaveBeenNthCalledWith(2, 'Item/Branch/3/Item/6', null, { params: { quantity: 25 } });
    });

    it('rejects a negative quantity without sending anything', async () => {
      await expect(updateInventoryItem(6, { ...payload, quantity: -1 })).rejects.toThrow('Quantity cannot be negative.');
      expect(mockedAxios.put).not.toHaveBeenCalled();
    });

    it('rejects a missing branch without sending anything', async () => {
      await expect(updateInventoryItem(6, { ...payload, branchId: 0 })).rejects.toThrow('No branchId provided for item 6');
      expect(mockedAxios.put).not.toHaveBeenCalled();
    });

    it('surfaces server errors', async () => {
      mockedAxios.put.mockRejectedValue(httpError(400, 'bad', 'Bad Request'));

      await expect(updateInventoryItem(6, payload)).rejects.toThrow('Fetch error 400 Bad Request');
    });
  });

  describe('createInventoryItem', () => {
    const payload = { itemName: 'Pallet Rack Frame', itemCategory: 'Metals', productionTime: 50, price: 7300 };

    it('creates the item with default stock and returns the saved item', async () => {
      mockedAxios.post.mockResolvedValue({ data: { itemID: 40, itemName: 'Pallet Rack Frame', itemCategory: 'Metals', productionTime: 50 } });

      const created = await createInventoryItem(payload);

      expect(mockedAxios.post).toHaveBeenCalledWith('Item/item/CreateItemDefaultQuantity', payload);
      expect(created).toEqual({ itemID: 40, itemName: 'Pallet Rack Frame', itemCategory: 'Metals', productionTime: 50 });
    });

    it('reads PascalCase responses and falls back to the request values', async () => {
      mockedAxios.post.mockResolvedValueOnce({ data: { ItemID: 41, ItemName: 'Rack', ItemCategory: 'Metals', ProductionTime: 12 } });
      await expect(createInventoryItem(payload)).resolves.toEqual({ itemID: 41, itemName: 'Rack', itemCategory: 'Metals', productionTime: 12 });

      mockedAxios.post.mockResolvedValueOnce({ data: {} });
      await expect(createInventoryItem(payload)).resolves.toEqual({ itemID: 0, itemName: 'Pallet Rack Frame', itemCategory: 'Metals', productionTime: 50 });
    });

    it('surfaces server errors', async () => {
      mockedAxios.post.mockRejectedValue(httpError(500, '', 'Server Error'));

      await expect(createInventoryItem(payload)).rejects.toThrow('Fetch error 500 Server Error');
    });
  });

  describe('createInventoryItemIngredient', () => {
    it('posts the ingredient using the backend’s field names', async () => {
      mockWritesSucceed();

      await createInventoryItemIngredient({ productID: 30, ingredientID: 1, ingredientQuantity: 2 });

      expect(mockedAxios.post).toHaveBeenCalledWith('Item/itemIngredient/', { ProductID: 30, IngredientID: 1, IngredientQuantity: 2 });
    });

    it('surfaces failures, including non-axios errors', async () => {
      mockedAxios.post.mockRejectedValueOnce(new Error('boom'));
      await expect(createInventoryItemIngredient({ productID: 30, ingredientID: 1, ingredientQuantity: 2 })).rejects.toThrow('boom');

      mockedAxios.post.mockRejectedValueOnce('weird');
      await expect(createInventoryItemIngredient({ productID: 30, ingredientID: 1, ingredientQuantity: 2 })).rejects.toThrow('Request failed');

      mockedAxios.post.mockRejectedValueOnce({ isAxiosError: true, message: '' });
      await expect(createInventoryItemIngredient({ productID: 30, ingredientID: 1, ingredientQuantity: 2 })).rejects.toThrow('Request failed');
    });

    it('formats an HTTP status without a status text', async () => {
      mockedAxios.post.mockRejectedValueOnce({ isAxiosError: true, message: 'x', response: { status: 418 } });

      await expect(createInventoryItemIngredient({ productID: 1, ingredientID: 1, ingredientQuantity: 1 })).rejects.toThrow(/^Fetch error 418$/);
    });
  });

  it('exposes every function on the default export', () => {
    expect(Object.keys(inventoryApi).sort()).toEqual([
      'buildInventoryOverview', 'createInventoryItem', 'createInventoryItemIngredient', 'getBranchItems', 'getBranches',
      'getDashboardPreview', 'getInventoryItems', 'getInventoryOverview', 'getItemCategoryOptions', 'getItemMaterialDetails',
      'getItems', 'updateInventoryItem',
    ]);
  });
});
