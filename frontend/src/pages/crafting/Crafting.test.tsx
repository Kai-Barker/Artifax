import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Crafting from './crafting';
import { showError, showSuccess } from '../../utils/toast';
import { httpError, mockedAxios, mockGet } from '../../test-utils/http';
import { adminUser, inventoryRowsFixture, itemsFixture, signIn, workbenchBlueprintFixture } from '../../test-utils/fixtures';

jest.mock('../../utils/toast', () => ({ showError: jest.fn(), showSuccess: jest.fn(), showInfo: jest.fn() }));

// Child components have their own tests; here they're stand-ins that expose their callbacks,
// so this suite can focus on the page's own data flow.
jest.mock('../../components/layout/AlertStrip', () => ({
  __esModule: true,
  default: ({ items }: any) => <div>Alert rows: {items.length}</div>,
}));
jest.mock('./components/craftingNav/craftingNav', () => ({
  __esModule: true,
  default: ({ onTabChange, onCreateBlueprint }: any) => (
    <nav>
      <button onClick={() => onTabChange('active')}>Active tab</button>
      <button onClick={() => onTabChange('history')}>History tab</button>
      <button onClick={() => onTabChange('craft')}>Craft tab</button>
      <button onClick={onCreateBlueprint}>New blueprint</button>
    </nav>
  ),
}));
jest.mock('./components/stats/stats', () => () => <div>Stats</div>);
jest.mock('./components/historyStats/historyStats', () => () => <div>History stats</div>);
jest.mock('./components/historyPanel/historyPanel', () => () => <div>History panel</div>);
jest.mock('./components/craftingItems/craftingItems', () => () => <div>Crafting items</div>);
jest.mock('./components/craftingQueue/craftingQueue', () => () => <div>Crafting queue</div>);
jest.mock('./components/craftPanel/craftPanel', () => ({
  __esModule: true,
  default: ({ blueprint, amount, orderExpedite, onAmountChange, onToggleExpedite, onCraft, onEdit, onDelete }: any) => (
    <section aria-label="craft panel">
      <h2>{blueprint.name}</h2>
      <p>{blueprint.description} · {blueprint.category} · have {blueprint.have}</p>
      <ul>
        {blueprint.materials.map((m: any) => (
          <li key={m.name}>{m.name}: need {m.need}, have {m.have}</li>
        ))}
      </ul>
      <p>Amount {amount} · expedite {String(orderExpedite)}</p>
      <button onClick={() => onAmountChange(3)}>Set amount 3</button>
      <button onClick={onToggleExpedite}>Toggle expedite</button>
      <button onClick={() => void onCraft()}>Craft</button>
      <button onClick={onEdit}>Edit</button>
      <button onClick={() => void onDelete()}>Delete</button>
    </section>
  ),
}));
jest.mock('./components/blueprintPanel/blueprintPanel', () => ({
  __esModule: true,
  default: ({ onSelectBlueprint, refreshKey }: any) => (
    <div>
      <span>Blueprints refreshed {refreshKey}</span>
      <button onClick={() => onSelectBlueprint('bp-30')}>Select workbench</button>
    </div>
  ),
}));
jest.mock('./components/newBlueprint/newBlueprint', () => ({
  __esModule: true,
  default: ({ onCancel }: any) => <button onClick={onCancel}>Cancel new blueprint</button>,
}));
jest.mock('./components/blueprintEdit/BlueprintEdit', () => ({
  __esModule: true,
  default: ({ itemId, onCancel, onSaved }: any) => (
    <div>
      <span>Editing item {itemId}</span>
      <button onClick={onCancel}>Cancel edit</button>
      <button onClick={onSaved}>Save edit</button>
    </div>
  ),
}));

const branchStock = [
  { BranchItemCapacityID: 1, BranchID: 1, ItemID: 1, ItemQuantity: 140 },
  { BranchItemCapacityID: 2, BranchID: 1, ItemID: 6, ItemQuantity: 4800 },
  { BranchItemCapacityID: 3, BranchID: 1, ItemID: 30, ItemQuantity: 14 },
];

function mockBackend(overrides: Record<string, unknown> = {}) {
  mockGet({
    'Item/item/allInventoryItems': inventoryRowsFixture,
    '/Item/item/30': { itemID: 30, itemName: 'Steel Workbench 1800mm', itemCategory: 'Furniture', productionTime: 45 },
    '/Item/itemIngredient/item/30': workbenchBlueprintFixture,
    '/Item/Branch/1': branchStock,
    '/Item/item': itemsFixture,
    ...overrides,
  });
}

async function openWorkbench() {
  render(<Crafting />);
  fireEvent.click(screen.getByRole('button', { name: 'Craft tab' }));
  fireEvent.click(screen.getByRole('button', { name: 'Select workbench' }));
  await screen.findByRole('heading', { name: 'Steel Workbench 1800mm' });
}

describe('Crafting page', () => {
  beforeEach(() => signIn());

  it('loads inventory for the low-stock strip and starts on the active jobs view', async () => {
    mockBackend();

    render(<Crafting />);

    expect(screen.getByRole('heading', { name: 'Crafting Management' })).toBeInTheDocument();
    expect(await screen.findByText('Alert rows: 5')).toBeInTheDocument();
    expect(screen.getByText('Crafting items')).toBeInTheDocument();
    expect(screen.getByText('Crafting queue')).toBeInTheDocument();
  });

  it('logs when the low-stock data can’t load', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend({ 'Item/item/allInventoryItems': httpError(500) });

    render(<Crafting />);

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load low stock alerts', expect.anything()));
  });

  it('builds the selected blueprint from the item, its ingredients and the branch’s stock', async () => {
    mockBackend();

    await openWorkbench();

    expect(screen.getByText('Production time: 45s · furniture · have 14')).toBeInTheDocument();
    expect(screen.getByText('Steel Sheet 2mm: need 2, have 140')).toBeInTheDocument();
    expect(screen.getByText('Hex Bolt M10: need 16, have 4800')).toBeInTheDocument();
  });

  it('shows the empty craft view before a blueprint is chosen', () => {
    mockBackend();
    render(<Crafting />);

    fireEvent.click(screen.getByRole('button', { name: 'Craft tab' }));

    expect(screen.getByText('No Blueprint Selected')).toBeInTheDocument();
  });

  it('handles item data in other casings and ingredients the item list doesn’t know', async () => {
    signIn({ ...adminUser, branchId: undefined });
    mockBackend({
      '/Item/item/30': { ItemID: 30, itemName: 'Workbench (fallback)', productionTime: 45 },
      '/Item/itemIngredient/item/30': [{ IngredientID: 77, quantity: 4 }, { itemName: 'Loose Part' }],
      '/Item/Branch': [{ itemId: 77, itemQuantity: 9 }, { itemID: 77, ItemQuantity: 1 }, { ItemQuantity: 5 }],
      '/Item/item': [{ itemId: 99, ItemName: 'Other' }, {}],
    });

    await openWorkbench().catch(() => undefined);
    expect(await screen.findByRole('heading', { name: 'Workbench (fallback)' })).toBeInTheDocument();
    expect(screen.getByText('Production time: 45s · mechanical · have 0')).toBeInTheDocument();
    expect(screen.getByText('Item 77: need 4, have 10')).toBeInTheDocument();
    expect(screen.getByText('Loose Part: need 0, have 0')).toBeInTheDocument();
  });

  it('logs when a blueprint can’t be loaded', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend({ '/Item/item/30': httpError(404) });
    render(<Crafting />);
    fireEvent.click(screen.getByRole('button', { name: 'Craft tab' }));

    fireEvent.click(screen.getByRole('button', { name: 'Select workbench' }));

    await waitFor(() => expect(error).toHaveBeenCalledWith('Error fetching selected blueprint:', expect.anything()));
    expect(screen.getByText('No Blueprint Selected')).toBeInTheDocument();
  });

  it('ignores empty item responses', async () => {
    mockBackend({ '/Item/item/30': null });
    render(<Crafting />);
    fireEvent.click(screen.getByRole('button', { name: 'Craft tab' }));

    fireEvent.click(screen.getByRole('button', { name: 'Select workbench' }));

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/Item/item'));
    expect(screen.getByText('No Blueprint Selected')).toBeInTheDocument();
  });

  describe('crafting an order', () => {
    it('creates the order, deducts the materials at the branch and confirms', async () => {
      mockBackend();
      mockedAxios.post.mockResolvedValue({ data: {} });
      mockedAxios.put.mockResolvedValue({ data: {} });
      await openWorkbench();
      fireEvent.click(screen.getByRole('button', { name: 'Set amount 3' }));
      fireEvent.click(screen.getByRole('button', { name: 'Toggle expedite' }));

      fireEvent.click(screen.getByRole('button', { name: 'Craft' }));

      await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Craft order submitted successfully and inventory updated.'));
      expect(mockedAxios.post).toHaveBeenCalledWith('/Order/create', { itemID: 30, quantity: 3, branchID: 1, employeeID: 1, orderExpedite: true });
      expect(mockedAxios.put).toHaveBeenCalledWith('/Item/Branch/1/Item/1', null, { params: { quantity: 134 } });
      expect(mockedAxios.put).toHaveBeenCalledWith('/Item/Branch/1/Item/6', null, { params: { quantity: 4752 } });
      expect(screen.getByText('Steel Sheet 2mm: need 2, have 134')).toBeInTheDocument();
      expect(screen.getByText('Blueprints refreshed 1')).toBeInTheDocument();
    });

    it('never takes stock below zero', async () => {
      mockBackend({ '/Item/Branch/1': [{ ItemID: 1, ItemQuantity: 1 }, { ItemID: 6, itemQuantity: 0 }, { ItemQuantity: 3 }] });
      mockedAxios.post.mockResolvedValue({ data: {} });
      mockedAxios.put.mockResolvedValue({ data: {} });
      await openWorkbench();

      fireEvent.click(screen.getByRole('button', { name: 'Craft' }));

      await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Item/Branch/1/Item/1', null, { params: { quantity: 0 } }));
      expect(screen.getByText('Steel Sheet 2mm: need 2, have 0')).toBeInTheDocument();
    });

    it('defaults to branch 1 and employee 1 when the user record lacks them', async () => {
      signIn({ name: 'Guest', role: 'Employee' });
      mockBackend({ '/Item/Branch': branchStock });
      mockedAxios.post.mockResolvedValue({ data: {} });
      mockedAxios.put.mockResolvedValue({ data: {} });
      await openWorkbench();

      fireEvent.click(screen.getByRole('button', { name: 'Craft' }));

      await waitFor(() => expect(mockedAxios.post).toHaveBeenCalledWith('/Order/create', expect.objectContaining({ branchID: 1, employeeID: 1 })));
    });

    it('skips materials without an item id when deducting', async () => {
      mockBackend({ '/Item/itemIngredient/item/30': [{ itemName: 'Unlinked', quantity: 1 }] });
      mockedAxios.post.mockResolvedValue({ data: {} });
      await openWorkbench();

      fireEvent.click(screen.getByRole('button', { name: 'Craft' }));

      await waitFor(() => expect(showSuccess).toHaveBeenCalled());
      expect(mockedAxios.put).not.toHaveBeenCalled();
    });

    it('warns when the order was created but some stock updates failed', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.post.mockResolvedValue({ data: {} });
      mockedAxios.put.mockResolvedValueOnce({ data: {} }).mockRejectedValueOnce(httpError(500));
      await openWorkbench();

      fireEvent.click(screen.getByRole('button', { name: 'Craft' }));

      await waitFor(() => expect(showError).toHaveBeenCalledWith('Craft order created, but updating some branch item quantities failed.'));
    });

    it('reports a failed order without touching stock', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.post.mockRejectedValue(httpError(400, 'Item does not exist.'));
      await openWorkbench();

      fireEvent.click(screen.getByRole('button', { name: 'Craft' }));

      await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to place craft order. Please try again.'));
      expect(mockedAxios.put).not.toHaveBeenCalled();
    });

    it('refuses to craft from the virtual branch 3', async () => {
      signIn({ ...adminUser, branchId: 3 });
      mockBackend({ '/Item/Branch/3': [] });
      await openWorkbench();

      fireEvent.click(screen.getByRole('button', { name: 'Craft' }));

      expect(showError).toHaveBeenCalledWith(expect.stringContaining('Branch 3 is a virtual branch'));
      expect(mockedAxios.post).not.toHaveBeenCalled();
    });
  });

  describe('editing and deleting the blueprint', () => {
    it('opens the editor for the selected item, and reloads the blueprint after saving', async () => {
      mockBackend();
      await openWorkbench();

      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
      expect(screen.getByText('Editing item 30')).toBeInTheDocument();

      const loadsBefore = mockedAxios.get.mock.calls.filter(([url]) => url === '/Item/item/30').length;
      fireEvent.click(screen.getByRole('button', { name: 'Save edit' }));
      await screen.findByRole('heading', { name: 'Steel Workbench 1800mm' });
      expect(mockedAxios.get.mock.calls.filter(([url]) => url === '/Item/item/30').length).toBe(loadsBefore + 1);
    });

    it('returns to the craft view when editing is cancelled', async () => {
      mockBackend();
      await openWorkbench();
      fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

      fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));

      expect(screen.getByRole('heading', { name: 'Steel Workbench 1800mm' })).toBeInTheDocument();
    });

    it('deletes the item after confirmation and resets the page', async () => {
      mockBackend();
      mockedAxios.delete.mockResolvedValue({ data: {} });
      jest.spyOn(window, 'confirm').mockReturnValue(true);
      await openWorkbench();

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Blueprint deleted successfully.'));
      expect(mockedAxios.delete).toHaveBeenCalledWith('/Item/30');
      expect(screen.getByText('Crafting items')).toBeInTheDocument();
    });

    it('does nothing when deletion is not confirmed', async () => {
      mockBackend();
      jest.spyOn(window, 'confirm').mockReturnValue(false);
      await openWorkbench();

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      expect(mockedAxios.delete).not.toHaveBeenCalled();
    });

    it('reports a failed delete', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.delete.mockRejectedValue(httpError(500));
      jest.spyOn(window, 'confirm').mockReturnValue(true);
      await openWorkbench();

      fireEvent.click(screen.getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to delete blueprint. Please try again.'));
    });
  });

  it('switches between the history and new-blueprint views', () => {
    mockBackend();
    render(<Crafting />);

    fireEvent.click(screen.getByRole('button', { name: 'History tab' }));
    expect(screen.getByText('History panel')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'New blueprint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel new blueprint' }));
    expect(screen.getByText('Crafting items')).toBeInTheDocument();
  });
});
