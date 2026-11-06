import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CraftingQueue from './craftingQueue';
import { httpError, mockedAxios, mockGet } from '../../../../test-utils/http';
import { adminUser, branchesFixture, ordersFixture, signIn, usersFixture } from '../../../../test-utils/fixtures';

const branchesApi = branchesFixture.map((b) => ({ BranchID: b.branchID, BranchName: b.branchName }));

function mockBackend(orders = ordersFixture) {
  mockGet({ '/Order': orders, '/User': usersFixture, '/Branch': branchesApi });
}

async function renderQueue() {
  render(<CraftingQueue />);
  await screen.findByText('Steel Workbench 1800mm x2 · Main Branch');
}

const goToUpNext = () => fireEvent.click(screen.getByRole('button', { name: 'Next' }));

describe('CraftingQueue', () => {
  beforeEach(() => signIn());

  it('shows active and paused orders for the user’s branch with progress from the backend', async () => {
    mockBackend();

    await renderQueue();

    expect(screen.getByText('2 / 3')).toBeInTheDocument();
    expect(screen.getByText('Active · Naledi Dlamini')).toBeInTheDocument();
    expect(screen.getByText('50% complete')).toBeInTheDocument();
    expect(screen.getByText('45 min left')).toBeInTheDocument();
    expect(screen.getByText('Paused · Naledi Dlamini')).toBeInTheDocument();
    // Completed and other-branch orders are not shown.
    expect(screen.queryByText(/Steel Sheet 2mm/)).not.toBeInTheDocument();
  });

  it('lists queued orders in queue-position order on the Up Next page', async () => {
    mockBackend();
    await renderQueue();

    goToUpNext();

    expect(screen.getByText('Page 2 / 2')).toBeInTheDocument();
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings).toEqual(['Up Next', 'Emergency Stop Button x5 · Main Branch', 'Hex Bolt M10 x50 · Main Branch']);
    expect(screen.getByText(/^#1 in queue/)).toBeInTheDocument();
    expect(screen.getByText(/^#2 in queue/)).toBeInTheDocument();
    expect(screen.getByText('25 min left')).toBeInTheDocument(); // expedited: 50 remaining / 2
  });

  it('shows empty states when the branch has no open orders', async () => {
    mockBackend([]);
    render(<CraftingQueue />);

    expect(await screen.findByText('No active crafts right now.')).toBeInTheDocument();
    expect(screen.getByText('Page 1 / 1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  it('moves a queued order later and saves the new order for that branch', async () => {
    mockBackend();
    // Like the real API: saving the order updates queue positions, which the reload then returns.
    mockedAxios.put.mockImplementation(async (_url: string, body: any) => {
      mockBackend(ordersFixture.map((o) => {
        const index = body.orderIds.indexOf(o.orderID);
        return index >= 0 ? { ...o, queuePosition: index + 1 } : o;
      }));
      return { data: [] };
    });
    await renderQueue();
    goToUpNext();

    fireEvent.click(screen.getByRole('button', { name: 'Move Emergency Stop Button later' }));

    await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Order/branch/1/queue', { orderIds: [104, 103] }));
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings.slice(1)).toEqual(['Hex Bolt M10 x50 · Main Branch', 'Emergency Stop Button x5 · Main Branch']);
  });

  it('moves a queued order earlier', async () => {
    mockBackend();
    mockedAxios.put.mockResolvedValue({ data: [] });
    await renderQueue();
    goToUpNext();

    fireEvent.click(screen.getByRole('button', { name: 'Move Hex Bolt M10 earlier' }));

    await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Order/branch/1/queue', { orderIds: [104, 103] }));
  });

  it('disables moves past either end of the branch queue', async () => {
    mockBackend();
    await renderQueue();
    goToUpNext();

    expect(screen.getByRole('button', { name: 'Move Emergency Stop Button earlier' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move Hex Bolt M10 later' })).toBeDisabled();
  });

  it('rolls back and explains when saving the new order fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend();
    mockedAxios.put.mockRejectedValue(httpError(409, 'The queue has changed since it was loaded.'));
    await renderQueue();
    goToUpNext();

    fireEvent.click(screen.getByRole('button', { name: 'Move Emergency Stop Button later' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Could not save the new order.');
    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings.slice(1)).toEqual(['Emergency Stop Button x5 · Main Branch', 'Hex Bolt M10 x50 · Main Branch']);
  });

  it('shows every branch to users of branch 3, grouped by branch', async () => {
    signIn({ ...adminUser, branchId: 3 });
    mockBackend([
      ...ordersFixture,
      { ...ordersFixture[2], orderID: 201, branchID: 3, itemName: 'PLC Controller Module', queuePosition: 1 },
    ]);
    render(<CraftingQueue />);
    await screen.findByText('Steel Workbench 1800mm x2 · Main Branch');

    goToUpNext();

    const headings = screen.getAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    expect(headings.slice(1)).toEqual([
      'PLC Controller Module x5 · Durban Assembly Plant',
      'Emergency Stop Button x5 · Main Branch',
      'Hex Bolt M10 x50 · Main Branch',
    ]);
    // Each branch's queue is numbered separately.
    expect(screen.getAllByText(/^#1 in queue/)).toHaveLength(2);
  });

  it('shows every branch when nobody is logged in, and labels unknown employees and branches', async () => {
    window.localStorage.clear();
    mockGet({
      '/Order': [{ ...ordersFixture[0], branchID: undefined, BranchID: 7, employeeID: 77, itemName: '' }],
      '/User': [...usersFixture, { employeeName: 'No Id' }],
      '/Branch': [...branchesApi, { branchID: 0, branchName: 'Ignored' }, { BranchID: 8 }],
    });
    render(<CraftingQueue />);

    expect(await screen.findByText('Order 101 x2 · Branch 7')).toBeInTheDocument();
    expect(screen.getByText('Active · Unknown Employee')).toBeInTheDocument();
  });

  it('keeps the queue quiet when loading fails', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ '/Order': httpError(500), '/User': usersFixture, '/Branch': branchesApi });

    render(<CraftingQueue />);

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load crafting queue orders', expect.anything()));
    expect(screen.getByText('No active crafts right now.')).toBeInTheDocument();
  });

  it('reloads when another component reports an order change, and every minute', async () => {
    jest.useFakeTimers();
    mockBackend();
    render(<CraftingQueue />);
    await act(async () => { await Promise.resolve(); });
    const initialCalls = mockedAxios.get.mock.calls.length;

    await act(async () => { window.dispatchEvent(new Event('crafting-order-updated')); });
    await act(async () => { jest.advanceTimersByTime(60_000); });

    expect(mockedAxios.get.mock.calls.length).toBeGreaterThanOrEqual(initialCalls + 6);
    jest.useRealTimers();
  });

  it('pages back from Up Next to the active crafts', async () => {
    mockBackend();
    await renderQueue();
    goToUpNext();

    fireEvent.click(screen.getByRole('button', { name: 'Prev' }));

    expect(screen.getByText('Active Crafts')).toBeInTheDocument();
    expect(within(screen.getByText('Page 1 / 2').parentElement!).getByRole('button', { name: 'Prev' })).toBeDisabled();
  });
});
