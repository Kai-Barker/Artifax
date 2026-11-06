import { act, render, screen, waitFor, within } from '@testing-library/react';
import DashboardPage from '../DashboardPage';
import { httpError, mockedAxios, mockGet } from '../../../test-utils/http';
import { inventoryRowsFixture, ordersFixture, signIn, usersFixture } from '../../../test-utils/fixtures';

function mockBackend(overrides: Record<string, unknown> = {}) {
  mockGet({ 'Item/item/allInventoryItems': inventoryRowsFixture, Order: ordersFixture, User: usersFixture, ...overrides });
}

const section = (title: string) => screen.getByRole('heading', { name: title, level: 4 }).parentElement as HTMLElement;

describe('DashboardPage', () => {
  beforeEach(() => signIn());

  it('previews inventory rows from the backend with stock stats', async () => {
    mockBackend();

    render(<DashboardPage />);

    expect(screen.getByText('Loading inventory...')).toBeInTheDocument();
    expect(await screen.findByText('Steel Sheet 2mm')).toBeInTheDocument();
    expect(screen.getByText('4800')).toBeInTheDocument();
    expect(screen.getAllByText('Emergency Stop Button').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('5 items')).toBeInTheDocument();
  });

  it('shows active and queued crafting jobs from the orders', async () => {
    mockBackend();

    render(<DashboardPage />);

    const active = await waitFor(() => {
      const el = section('Active Jobs');
      expect(within(el).getAllByRole('heading', { level: 3, name: 'Steel Workbench 1800mm' })).toHaveLength(2);
      return el;
    });
    expect(within(active).getByText('ID: order-101 · Qty: 2')).toBeInTheDocument();
    expect(within(active).getByText('50% Complete')).toBeInTheDocument();
    expect(within(active).getAllByText('Naledi Dlamini')).toHaveLength(2);

    const queued = section('Queued Jobs');
    expect(within(queued).getByText('Emergency Stop Button')).toBeInTheDocument();
    expect(within(queued).getByText('25 min left')).toBeInTheDocument();
    expect(within(queued).getAllByText(/^Created \d/)).toHaveLength(2);
  });

  it('shows "Date Unknown" for queued jobs with a missing or invalid created date', async () => {
    mockBackend({
      Order: [
        { orderID: 2, status: 'Queued', itemName: 'Undated', createdDateTime: 'not-a-date' },
        { orderID: 3, status: 'Queued', itemName: 'No date' },
      ],
      User: [],
    });

    render(<DashboardPage />);

    await waitFor(() => expect(within(section('Queued Jobs')).getAllByText('Created: Date Unknown')).toHaveLength(2));
  });

  it('shows empty states when there are no jobs or inventory', async () => {
    mockBackend({ 'Item/item/allInventoryItems': [], Order: [], User: [] });

    render(<DashboardPage />);

    expect(await screen.findByText('No live inventory rows available yet.')).toBeInTheDocument();
    expect(screen.getByText('No active jobs')).toBeInTheDocument();
    expect(screen.getByText('No queued jobs')).toBeInTheDocument();
  });

  it('logs and shows empty sections when loading fails', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend({ 'Item/item/allInventoryItems': httpError(500), Order: httpError(500) });

    render(<DashboardPage />);

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load dashboard inventory data', expect.anything()));
    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load crafting jobs', expect.anything()));
    expect(screen.getByText('No live inventory rows available yet.')).toBeInTheDocument();
    expect(screen.getByText('No active jobs')).toBeInTheDocument();
  });

  it('refreshes the jobs every 10 seconds, without overlapping requests, and stops when unmounted', async () => {
    jest.useFakeTimers();
    mockBackend();
    const { unmount } = render(<DashboardPage />);
    await act(async () => { await Promise.resolve(); });
    const orderCalls = () => mockedAxios.get.mock.calls.filter(([url]) => url === 'Order').length;
    const afterFirstLoad = orderCalls();

    await act(async () => { jest.advanceTimersByTime(10_000); });
    expect(orderCalls()).toBe(afterFirstLoad + 1);

    unmount();
    await act(async () => { jest.advanceTimersByTime(30_000); });
    expect(orderCalls()).toBe(afterFirstLoad + 1);
    jest.useRealTimers();
  });

  it('ignores results that arrive after the page is closed', async () => {
    let resolveInventory: (value: unknown) => void = () => {};
    let resolveOrders: (value: unknown) => void = () => {};
    mockedAxios.get.mockImplementation((url: string) => {
      if (url === 'Item/item/allInventoryItems') return new Promise((r) => { resolveInventory = r; }) as never;
      if (url === 'Order') return new Promise((r) => { resolveOrders = r; }) as never;
      return Promise.resolve({ data: [] }) as never;
    });
    const { unmount } = render(<DashboardPage />);

    unmount();
    await act(async () => {
      resolveInventory({ data: inventoryRowsFixture });
      resolveOrders({ data: ordersFixture });
      await Promise.resolve();
    });

    expect(screen.queryByText('Steel Sheet 2mm')).not.toBeInTheDocument();
  });

  it('ignores failures that arrive after the page is closed', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    let rejectInventory: (reason: unknown) => void = () => {};
    let rejectOrders: (reason: unknown) => void = () => {};
    mockedAxios.get.mockImplementation((url: string) => {
      if (url === 'Item/item/allInventoryItems') return new Promise((_, r) => { rejectInventory = r; }) as never;
      if (url === 'Order') return new Promise((_, r) => { rejectOrders = r; }) as never;
      return Promise.resolve({ data: [] }) as never;
    });
    const { unmount } = render(<DashboardPage />);

    unmount();
    await act(async () => {
      rejectInventory(httpError(500));
      rejectOrders(httpError(500));
      await Promise.resolve();
    });

    expect(screen.queryByText('No active jobs')).not.toBeInTheDocument();
  });
});
