import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import HistoryPanel from './historyPanel';
import { httpError, mockedAxios, mockGet } from '../../../../test-utils/http';
import { workbenchBlueprintFixture } from '../../../../test-utils/fixtures';

const history = [
  { orderID: 1, itemID: 30, itemName: 'Steel Workbench 1800mm', quantity: 6, status: 'Complete', createdDateTime: '2026-10-01T08:00:00Z', completedDateTime: '2026-10-01T12:00:00Z', employeeName: 'Naledi Dlamini' },
  { orderID: 2, itemID: 20, itemName: 'Emergency Stop Button', quantity: 12, status: 'Cancelled', createdDateTime: '2026-10-05T08:00:00Z', employeeName: 'Ruan Botha' },
  { orderID: 3, itemID: 6, itemName: 'Hex Bolt M10', quantity: 2, status: 'completed', createdDateTime: '2026-10-03T08:00:00Z' },
  { orderID: 4, itemID: 1, itemName: 'Active Order', quantity: 1, status: 'Active' },
  { orderID: 5, itemID: 1, itemName: 'Zinc Plate', quantity: 3, status: 'canceled', createdDateTime: 'not a date' },
];

const itemNames = () => Array.from(document.querySelectorAll('.item-name')).map((n) => n.textContent);

const FINISHED = ['complete', 'completed', 'cancelled', 'canceled'];

async function renderPanel(orders: any[] | null = history) {
  mockGet({ '/Order': orders, '/Item/itemIngredient/item/30': workbenchBlueprintFixture, '/Item/itemIngredient/item/20': null });
  render(<HistoryPanel />);
  const finished = (orders ?? []).filter((o) => FINISHED.includes(String(o.status).toLowerCase())).length;
  await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/Order'));
  await screen.findByText(`${finished} orders`);
  if (finished > 0) await waitFor(() => expect(itemNames().length).toBeGreaterThan(0));
}

describe('HistoryPanel', () => {
  it('lists only finished orders from the backend, with counts per status', async () => {
    await renderPanel();

    expect(screen.getByText('4 orders')).toBeInTheDocument();
    expect(itemNames()).toEqual(['Emergency Stop Button', 'Hex Bolt M10', 'Steel Workbench 1800mm', 'Zinc Plate']);
    expect(screen.getByRole('button', { name: 'All (4)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete (2)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancelled (2)' })).toBeInTheDocument();
    const benchRow = screen.getByText('Steel Workbench 1800mm').closest('tr')!;
    expect(within(benchRow).getByText('Naledi Dlamini')).toBeInTheDocument();
    expect(within(benchRow).getByText('Order #1')).toBeInTheDocument();
    const boltRow = screen.getByText('Hex Bolt M10').closest('tr')!;
    expect(within(boltRow).getByText('Unknown')).toBeInTheDocument();
    expect(within(screen.getByText('Zinc Plate').closest('tr')!).getByText('N/A')).toBeInTheDocument();
  });

  it('filters by tab, status filter and search', async () => {
    await renderPanel();

    // "completed"/"canceled" spellings are grouped with their tab, matching the tab counts.
    fireEvent.click(screen.getByRole('button', { name: 'Complete (2)' }));
    expect(itemNames()).toEqual(['Hex Bolt M10', 'Steel Workbench 1800mm']);

    fireEvent.click(screen.getByRole('button', { name: 'All (4)' }));
    fireEvent.click(screen.getByRole('button', { name: 'Status filter' }));
    fireEvent.click(screen.getByRole('option', { name: 'Cancelled' }));
    expect(itemNames()).toEqual(['Emergency Stop Button', 'Zinc Plate']);

    fireEvent.click(screen.getByRole('button', { name: 'Status filter' }));
    fireEvent.click(screen.getByRole('option', { name: 'All' }));
    fireEvent.change(screen.getByPlaceholderText('Search items, employee...'), { target: { value: 'ruan' } });
    expect(itemNames()).toEqual(['Emergency Stop Button']);

    fireEvent.change(screen.getByPlaceholderText('Search items, employee...'), { target: { value: 'canceled' } });
    expect(itemNames()).toEqual(['Zinc Plate']);
  });

  it.each([
    ['Qty', ['Emergency Stop Button', 'Steel Workbench 1800mm', 'Zinc Plate', 'Hex Bolt M10']],
    ['Date', ['Emergency Stop Button', 'Hex Bolt M10', 'Steel Workbench 1800mm', 'Zinc Plate']],
  ])('sorts by %s', async (option, expected) => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sort filter' }));
    fireEvent.click(screen.getByRole('option', { name: option }));

    expect(itemNames()).toEqual(expected);
  });

  it('sorts by employee, with unassigned orders first', async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Sort filter' }));
    fireEvent.click(screen.getByRole('option', { name: 'Employee' }));

    // Hex Bolt and Zinc Plate have no employee; then Naledi, then Ruan.
    expect(itemNames().slice(2)).toEqual(['Steel Workbench 1800mm', 'Emergency Stop Button']);
  });

  it('expands an order to show the ingredients used, loading them once', async () => {
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'View Steel Workbench 1800mm' }));
    expect(screen.getByText('Loading ingredients...')).toBeInTheDocument();
    expect(await screen.findByText('×16')).toBeInTheDocument();
    expect(screen.getByText('Hex Bolt M10', { selector: '.ingredient-name' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Steel Workbench 1800mm' }));
    expect(screen.queryByText('Ingredients Used')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'View Steel Workbench 1800mm' }));
    expect(screen.getByText('×16')).toBeInTheDocument();
    expect(mockedAxios.get.mock.calls.filter(([url]) => url === '/Item/itemIngredient/item/30')).toHaveLength(1);
  });

  it('shows an empty ingredient list for missing or failed blueprints', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    await renderPanel();

    fireEvent.click(screen.getByRole('button', { name: 'View Emergency Stop Button' }));
    expect(await screen.findByText('No ingredients recorded for this item.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'View Hex Bolt M10' }));
    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load ingredients for item 6', expect.anything()));
    expect(screen.getByText('No ingredients recorded for this item.')).toBeInTheDocument();
  });

  it('pages through more than 10 orders', async () => {
    const many = Array.from({ length: 23 }, (_, i) => ({ orderID: 100 + i, itemID: 1, itemName: `Part ${String(i).padStart(2, '0')}`, quantity: 1, status: 'Complete' }));
    await renderPanel(many);

    expect(screen.getByText('Showing 10 of 23 items · Rows per page 10')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '3' }));
    expect(itemNames()).toEqual(['Part 20', 'Part 21', 'Part 22']);
    expect(screen.getByRole('button', { name: '›' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '‹' }));
    expect(itemNames()[0]).toBe('Part 10');
    fireEvent.click(screen.getByRole('button', { name: '›' }));
    expect(itemNames()[0]).toBe('Part 20');

    // Changing filters returns to page 1.
    fireEvent.change(screen.getByPlaceholderText('Search items, employee...'), { target: { value: 'Part' } });
    expect(itemNames()[0]).toBe('Part 00');
    expect(screen.getByRole('button', { name: '‹' })).toBeDisabled();
  });

  it('shows an empty history when loading fails or returns nothing', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ '/Order': httpError(500) });
    const { unmount } = render(<HistoryPanel />);
    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load order history', expect.anything()));
    expect(screen.getByText('0 orders')).toBeInTheDocument();
    unmount();

    await renderPanel(null);
    expect(screen.getByText('0 orders')).toBeInTheDocument();
  });

  it('labels orders with no status as Unknown', async () => {
    await renderPanel([{ orderID: 9, itemID: 1, itemName: 'Mystery', quantity: 1, status: 'complete' }]);
    expect(screen.getByText('complete')).toBeInTheDocument();
  });
});
