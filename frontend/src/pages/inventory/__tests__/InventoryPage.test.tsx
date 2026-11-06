import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import InventoryPage from '../InventoryPage';
import { httpError, mockedAxios, mockGet, mockWritesSucceed } from '../../../test-utils/http';
import { inventoryRowsFixture, itemsFixture, signIn, workbenchBlueprintFixture } from '../../../test-utils/fixtures';

// The modals have their own tests; here they're stand-ins that expose what the page passes them.
jest.mock('../components/InventoryItemEditModal', () => ({
  __esModule: true,
  default: ({ item, open, onSave, onClose }: any) => (open ? (
    <div role="dialog" aria-label="edit">
      <span>Editing {item?.name} at {item?.location} (qty {item?.quantity})</span>
      <button onClick={() => onSave(Number(item.id), { itemName: item.name, itemCategory: item.category, productionTime: 2, price: 260, quantity: 9, branchId: item.branchId }).catch(() => {})}>Save edit</button>
      <button onClick={onClose}>Close edit</button>
    </div>
  ) : null),
}));
jest.mock('../components/InventoryItemCreateModal', () => ({
  __esModule: true,
  default: ({ open, onCreate, onClose, categoryOptions }: any) => (open ? (
    <div role="dialog" aria-label="create">
      <span>Categories: {categoryOptions.join(', ')}</span>
      <button onClick={() => onCreate({ itemName: 'Pallet Rack Frame', itemCategory: 'Metals', productionTime: 50, price: 7300 }).catch(() => {})}>Create item</button>
      <button onClick={onClose}>Close create</button>
    </div>
  ) : null),
}));
jest.mock('../components/InventoryItemIngredientModal', () => ({
  __esModule: true,
  default: ({ open, item, onClose }: any) => (open ? (
    <div role="dialog" aria-label="ingredients">
      <span>Add ingredients for {item.itemName}</span>
      <button onClick={onClose}>Close ingredients</button>
    </div>
  ) : null),
}));

function mockBackend(overrides: Record<string, unknown> = {}) {
  mockGet({
    'Item/item/allInventoryItems': inventoryRowsFixture,
    'Item/item/': itemsFixture,
    'Item/item/30': itemsFixture[3],
    'Item/itemIngredient/item/30': workbenchBlueprintFixture,
    ...overrides,
  });
}

const rowNames = () => screen.getAllByRole('row').slice(1).map((row) => within(row).queryByText(/./, { selector: 'p.font-semibold' })?.textContent);

async function renderPage() {
  render(<InventoryPage />);
  await screen.findByText('Steel Sheet 2mm');
}

// The three dropdowns (status, location, sort) all share the accessible name "Filter options".
const FILTERS = { status: 0, location: 1, sort: 2 } as const;
function pick(filter: keyof typeof FILTERS, option: string) {
  fireEvent.click(screen.getAllByRole('button', { name: 'Filter options' })[FILTERS[filter]]);
  fireEvent.click(screen.getByRole('option', { name: option }));
}

describe('InventoryPage', () => {
  beforeEach(() => signIn());

  it('lists every branch row from the backend with its stats', async () => {
    mockBackend();

    await renderPage();

    expect(screen.getByText('5 items')).toBeInTheDocument();
    expect(rowNames()).toEqual(['Emergency Stop Button', 'Emergency Stop Button', 'Hex Bolt M10', 'Steel Sheet 2mm', 'Steel Workbench 1800mm']);
    expect(screen.getByText('4800')).toBeInTheDocument();
    expect(screen.getAllByText('Durban Assembly Plant').length).toBeGreaterThan(0);
    expect(screen.getByText('Total Items')).toBeInTheDocument();
  });

  it('shows the empty state when loading fails', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend({ 'Item/item/allInventoryItems': httpError(500) });

    render(<InventoryPage />);

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load inventory items', expect.anything()));
    expect(screen.getByText('No items match your current filters.')).toBeInTheDocument();
  });

  describe('filtering', () => {
    it('searches by name, SKU or location', async () => {
      mockBackend();
      await renderPage();
      const search = screen.getByPlaceholderText('Search items, SKU, location...');

      fireEvent.change(search, { target: { value: 'fas-6' } });
      expect(rowNames()).toEqual(['Hex Bolt M10']);

      fireEvent.change(search, { target: { value: 'durban' } });
      expect(rowNames()).toEqual(['Emergency Stop Button']);

      fireEvent.change(search, { target: { value: 'nothing-matches' } });
      expect(screen.getByText('No items match your current filters.')).toBeInTheDocument();
    });

    it('filters by status and location, and sorts by quantity', async () => {
      mockBackend();
      await renderPage();

      pick('status', 'Status: Low');
      expect(rowNames()).toEqual(['Emergency Stop Button', 'Emergency Stop Button']);

      pick('status', 'Status: All');
      pick('location', 'Location: Main Branch');
      pick('sort', 'Sort: Quantity');
      expect(rowNames()).toEqual(['Hex Bolt M10', 'Steel Sheet 2mm', 'Steel Workbench 1800mm', 'Emergency Stop Button']);
    });

    it('filters by category tab, matching singular and plural names', async () => {
      mockBackend({
        'Item/item/allInventoryItems': [
          ...inventoryRowsFixture,
          { ...inventoryRowsFixture[3], inventoryItemId: 7, inventoryItemName: 'Hex Nut M10', inventoryItemCategory: 'Fastener' },
        ],
      });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: /^Fasteners \(\d+\)$/ }));
      expect(rowNames()).toEqual(['Hex Bolt M10', 'Hex Nut M10']);

      fireEvent.click(screen.getByRole('button', { name: /^Glass/ }));
      expect(screen.getByText('No items match your current filters.')).toBeInTheDocument();

      // Searching looks across every category, whatever tab is open.
      fireEvent.change(screen.getByPlaceholderText('Search items, SKU, location...'), { target: { value: 'steel' } });
      expect(rowNames()).toEqual(['Steel Sheet 2mm', 'Steel Workbench 1800mm']);
    });
  });

  describe('viewing materials', () => {
    it('expands only the clicked row and shows its blueprint with stock per branch', async () => {
      mockBackend();
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'View Steel Workbench 1800mm' }));

      expect(await screen.findByText('Steel Sheet 2mm', { selector: '.inventory-view-details *' })).toBeInTheDocument();
      expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);

      fireEvent.click(screen.getByRole('button', { name: 'View Steel Workbench 1800mm' }));
      expect(screen.queryAllByRole('button', { expanded: true })).toHaveLength(0);
    });

    it('expands one branch row of an item without expanding the others', async () => {
      mockBackend({ 'Item/item/20': itemsFixture[2], 'Item/itemIngredient/item/20': [] });
      await renderPage();

      fireEvent.click(screen.getAllByRole('button', { name: 'View Emergency Stop Button' })[1]);

      const buttons = screen.getAllByRole('button', { name: 'View Emergency Stop Button' });
      expect(buttons.map((b) => b.getAttribute('aria-expanded'))).toEqual(['false', 'true']);
      await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('Item/item/20'));
    });

    it('reuses loaded materials instead of fetching again', async () => {
      mockBackend();
      await renderPage();
      const view = screen.getByRole('button', { name: 'View Steel Workbench 1800mm' });

      fireEvent.click(view);
      await screen.findByText('Steel Sheet 2mm', { selector: '.inventory-view-details *' });
      fireEvent.click(view);
      fireEvent.click(view);

      expect(mockedAxios.get.mock.calls.filter(([url]) => url === 'Item/item/30')).toHaveLength(1);
    });

    it('logs when materials fail to load', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend({ 'Item/item/30': httpError(500) });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'View Steel Workbench 1800mm' }));

      await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load materials for item 30', expect.anything()));
    });
  });

  describe('editing', () => {
    it('opens the clicked branch’s row and saves to that branch', async () => {
      mockBackend();
      mockWritesSucceed();
      await renderPage();

      fireEvent.click(screen.getAllByRole('button', { name: 'Edit Emergency Stop Button' })[1]);
      expect(screen.getByText('Editing Emergency Stop Button at Durban Assembly Plant (qty 4)')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));

      await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('Item/Branch/3/Item/20', null, { params: { quantity: 9 } }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'edit' })).not.toBeInTheDocument());
    });

    it('keeps the editor open and logs when saving fails', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.put.mockRejectedValue(httpError(500));
      await renderPage();
      fireEvent.click(screen.getAllByRole('button', { name: 'Edit Emergency Stop Button' })[0]);

      fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));

      await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to save item 20', expect.anything()));
      expect(screen.getByRole('dialog', { name: 'edit' })).toBeInTheDocument();
    });

    it('closes the editor without saving', async () => {
      mockBackend();
      await renderPage();
      fireEvent.click(screen.getAllByRole('button', { name: 'Edit Hex Bolt M10' })[0]);

      fireEvent.click(screen.getByRole('button', { name: 'Close edit' }));

      expect(screen.queryByRole('dialog', { name: 'edit' })).not.toBeInTheDocument();
      expect(mockedAxios.put).not.toHaveBeenCalled();
    });
  });

  describe('adding an item', () => {
    it('creates the item with the known categories, then asks for its ingredients', async () => {
      mockBackend();
      mockedAxios.post.mockResolvedValue({ data: { itemID: 40, itemName: 'Pallet Rack Frame', itemCategory: 'Metals', productionTime: 50 } });
      await renderPage();

      fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));
      expect(screen.getByText('Categories: Electronics, Fasteners, Furniture, Metals')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Create item' }));

      expect(await screen.findByText('Add ingredients for Pallet Rack Frame')).toBeInTheDocument();
      expect(screen.queryByRole('dialog', { name: 'create' })).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Close ingredients' }));
      expect(screen.queryByRole('dialog', { name: 'ingredients' })).not.toBeInTheDocument();
    });

    it('keeps the form open and logs when creating fails', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.post.mockRejectedValue(httpError(500));
      await renderPage();
      fireEvent.click(screen.getByRole('button', { name: 'Add Item' }));

      fireEvent.click(screen.getByRole('button', { name: 'Create item' }));

      await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to create inventory item', expect.anything()));
      expect(screen.getByRole('dialog', { name: 'create' })).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Close create' }));
      expect(screen.queryByRole('dialog', { name: 'create' })).not.toBeInTheDocument();
    });
  });
});
