import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import CraftingItems from './craftingItems';
import { showError } from '../../../../utils/toast';
import { httpError, mockedAxios, mockGet, mockWritesSucceed } from '../../../../test-utils/http';
import { adminUser, branchesFixture, ordersFixture, signIn, usersFixture, workbenchBlueprintFixture } from '../../../../test-utils/fixtures';

jest.mock('../../../../utils/toast', () => ({ showError: jest.fn(), showSuccess: jest.fn(), showInfo: jest.fn() }));

const active = (overrides: Record<string, unknown>) => ({ ...ordersFixture[0], ...overrides });

function mockBackend(orders: unknown[] = ordersFixture) {
  mockGet({
    '/Order': orders,
    '/User': usersFixture,
    '/Branch': branchesFixture,
    '/Item/itemIngredient/item/30': workbenchBlueprintFixture,
  });
}

const card = (name: string) => screen.getAllByRole('heading', { level: 3, name }).map((h) => h.closest('.job-card') as HTMLElement);

describe('CraftingItems', () => {
  beforeEach(() => signIn());

  it('renders a card per active or paused order at the user’s branch, with backend progress and materials', async () => {
    mockBackend();

    render(<CraftingItems />);

    const [activeCard, pausedCard] = await waitFor(() => card('Steel Workbench 1800mm'));
    expect(within(activeCard).getByText('Employee: Naledi Dlamini · Qty: 2 · Main Branch')).toBeInTheDocument();
    expect(within(activeCard).getByText('50% Complete')).toBeInTheDocument();
    expect(within(activeCard).getByText('45 min left')).toBeInTheDocument();
    expect(within(activeCard).getByText('Steel Sheet 2mm x2')).toBeInTheDocument();
    expect(within(activeCard).getByText('Hex Bolt M10 x16')).toBeInTheDocument();
    expect(within(activeCard).getByRole('button', { name: 'Pause' })).toBeInTheDocument();
    expect(within(pausedCard).getByText('Paused')).toBeInTheDocument();
    expect(within(pausedCard).getByRole('button', { name: 'Resume' })).toBeInTheDocument();
    // Queued, completed and other-branch orders don't get cards.
    expect(screen.queryByText('Emergency Stop Button')).not.toBeInTheDocument();
    expect(screen.queryByText('Steel Sheet 2mm', { selector: 'h3' })).not.toBeInTheDocument();
  });

  it('shows the expedite state from the backend', async () => {
    mockBackend([active({ orderExpedite: true })]);

    render(<CraftingItems />);

    const toggle = await screen.findByRole('checkbox', { name: 'Order Expedite for Steel Workbench 1800mm' });
    expect(toggle).toBeChecked();
    expect(screen.getByText('Double speed · remaining time halved')).toBeInTheDocument();
    expect(screen.getByText('23 min left')).toBeInTheDocument();
  });

  it('shows an empty state when nothing is in production', async () => {
    mockBackend([]);

    render(<CraftingItems />);

    expect(await screen.findByText('No active jobs available.')).toBeInTheDocument();
  });

  it('falls back to the item name when a blueprint can’t be loaded, and labels missing data', async () => {
    window.localStorage.clear(); // no user: every branch is shown
    mockBackend([active({ itemID: 99, itemName: '', employeeID: 404, branchID: undefined, BranchID: 7, quantity: undefined })]);

    render(<CraftingItems />);

    expect(await screen.findByRole('heading', { name: 'Order 101' })).toBeInTheDocument();
    expect(screen.getByText('Employee: Unknown Employee · Qty: 1 · Branch 7')).toBeInTheDocument();
    expect(screen.getByText('Item 99')).toBeInTheDocument();
  });

  it('formats blueprint ingredients that are missing a name or quantity', async () => {
    mockGet({
      '/Order': [active({ itemID: 5 })],
      '/User': [...usersFixture, { employeeName: 'No id' }],
      '/Branch': [{ BranchID: 1, BranchName: 'Main Branch' }, { branchID: 0, branchName: '' }],
      '/Item/itemIngredient/item/5': [{ ingredientID: 8 }, {}],
    });

    render(<CraftingItems />);

    expect(await screen.findByText('Ingredient 8 x1')).toBeInTheDocument();
    expect(screen.getByText(/^Ingredient\s+x1$/)).toBeInTheDocument();
  });

  it('shows every branch to branch-3 users, and to visitors with no stored user', async () => {
    signIn({ ...adminUser, branchId: 3 });
    mockBackend([active({}), active({ orderID: 300, branchID: 3, itemName: 'PLC Controller Module', itemID: 15 })]);
    const { unmount } = render(<CraftingItems />);
    expect(await screen.findByRole('heading', { name: 'PLC Controller Module' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Steel Workbench 1800mm' })).toBeInTheDocument();
    unmount();

    window.localStorage.clear();
    render(<CraftingItems />);
    expect(await screen.findByRole('heading', { name: 'PLC Controller Module' })).toBeInTheDocument();
  });

  it('logs and shows nothing when loading fails', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ '/Order': httpError(500), '/User': usersFixture, '/Branch': branchesFixture });

    render(<CraftingItems />);

    await waitFor(() => expect(error).toHaveBeenCalledWith('Unable to load crafting items orders', expect.anything()));
    expect(screen.getByText('No active jobs available.')).toBeInTheDocument();
  });

  describe('actions', () => {
    it('pauses an active order', async () => {
      mockBackend();
      mockWritesSucceed();
      render(<CraftingItems />);
      const [activeCard] = await waitFor(() => card('Steel Workbench 1800mm'));

      fireEvent.click(within(activeCard).getByRole('button', { name: 'Pause' }));

      await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Order/101/status', { status: 'Paused' }));
    });

    it('resumes a paused order when the branch has a free slot', async () => {
      mockBackend();
      mockWritesSucceed();
      render(<CraftingItems />);
      const [, pausedCard] = await waitFor(() => card('Steel Workbench 1800mm'));

      fireEvent.click(within(pausedCard).getByRole('button', { name: 'Resume' }));

      await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Order/102/status', { status: 'Active' }));
      expect(showError).not.toHaveBeenCalled();
    });

    it('blocks resuming when the branch already has 3 active crafts, without calling the API', async () => {
      mockBackend([
        active({ orderID: 1 }), active({ orderID: 2 }), active({ orderID: 3 }),
        active({ orderID: 4, status: 'Paused', itemName: 'Lifting Sling Assembly', itemID: 38 }),
      ]);
      render(<CraftingItems />);
      const resume = await screen.findByRole('button', { name: 'Resume' });

      fireEvent.click(resume);

      expect(showError).toHaveBeenCalledWith("Can't resume Lifting Sling Assembly. Main Branch already has 3 crafts in progress. Pause or finish one first.");
      expect(mockedAxios.put).not.toHaveBeenCalled();
    });

    it('shows the limit message when the server rejects a resume for the same reason', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.put.mockRejectedValue(httpError(400, 'Cannot activate order. Branch 1 already has 3 active orders.'));
      render(<CraftingItems />);
      const [, pausedCard] = await waitFor(() => card('Steel Workbench 1800mm'));

      fireEvent.click(within(pausedCard).getByRole('button', { name: 'Resume' }));

      await waitFor(() => expect(showError).toHaveBeenCalledWith(expect.stringMatching(/^Can't resume Steel Workbench 1800mm\./)));
    });

    it('shows a generic error for other pause/resume failures', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.put.mockRejectedValueOnce(httpError(500, 'boom')).mockRejectedValueOnce(new Error('offline'));
      render(<CraftingItems />);
      const [activeCard, pausedCard] = await waitFor(() => card('Steel Workbench 1800mm'));

      fireEvent.click(within(activeCard).getByRole('button', { name: 'Pause' }));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to pause Steel Workbench 1800mm. Please try again.'));

      fireEvent.click(within(pausedCard).getByRole('button', { name: 'Resume' }));
      await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to resume Steel Workbench 1800mm. Please try again.'));
    });

    it('treats a 400 with no body as a generic resume error', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend();
      mockedAxios.put.mockRejectedValue(httpError(400, undefined));
      render(<CraftingItems />);
      const [, pausedCard] = await waitFor(() => card('Steel Workbench 1800mm'));

      fireEvent.click(within(pausedCard).getByRole('button', { name: 'Resume' }));

      await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to resume Steel Workbench 1800mm. Please try again.'));
    });

    it('toggles expedite with the order’s details', async () => {
      mockBackend([active({})]);
      mockWritesSucceed();
      render(<CraftingItems />);

      fireEvent.click(await screen.findByRole('checkbox', { name: /Order Expedite/ }));

      await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Order/101', {
        itemID: 30, quantity: 2, branchID: 1, employeeID: 1, orderExpedite: true,
      }));
    });

    it('falls back to the current user as employee when the order has none', async () => {
      mockBackend([active({ employeeID: null, orderExpedite: true })]);
      mockWritesSucceed();
      render(<CraftingItems />);

      fireEvent.click(await screen.findByRole('checkbox', { name: /Order Expedite/ }));

      await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Order/101', expect.objectContaining({ employeeID: 1, orderExpedite: false })));
    });

    it('uses employee 0 when neither the order nor a user is known', async () => {
      window.localStorage.clear();
      mockBackend([active({ employeeID: null })]);
      mockWritesSucceed();
      render(<CraftingItems />);

      fireEvent.click(await screen.findByRole('checkbox', { name: /Order Expedite/ }));

      await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Order/101', expect.objectContaining({ employeeID: 0 })));
    });

    it('logs expedite and cancel failures', async () => {
      const error = jest.spyOn(console, 'error').mockImplementation(() => {});
      mockBackend([active({})]);
      mockedAxios.put.mockRejectedValue(httpError(500));
      render(<CraftingItems />);

      fireEvent.click(await screen.findByRole('checkbox', { name: /Order Expedite/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(error).toHaveBeenCalledWith('Unable to update expedite for order 101', expect.anything()));
      await waitFor(() => expect(error).toHaveBeenCalledWith('Unable to cancel order 101', expect.anything()));
    });

    it('cancels an order and tells the queue to refresh', async () => {
      mockBackend([active({})]);
      mockWritesSucceed();
      const refreshed = jest.fn();
      window.addEventListener('crafting-order-updated', refreshed);
      render(<CraftingItems />);

      fireEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

      await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Order/101/status', { status: 'Cancelled' }));
      await waitFor(() => expect(refreshed).toHaveBeenCalled());
      window.removeEventListener('crafting-order-updated', refreshed);
    });
  });

  it('tilts a card under the mouse and resets when it leaves', async () => {
    mockBackend([active({})]);
    render(<CraftingItems />);
    const [jobCard] = await waitFor(() => card('Steel Workbench 1800mm'));
    jobCard.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100 } as DOMRect);

    fireEvent.mouseMove(jobCard, { clientX: 150, clientY: 25 });
    expect(jobCard.style.transform).toContain('scale(1.02)');

    fireEvent.mouseLeave(jobCard);
    expect(jobCard.style.transform).toBe('');
  });

  it('refreshes every minute and when other components change an order', async () => {
    jest.useFakeTimers();
    mockBackend([active({})]);
    render(<CraftingItems />);
    await act(async () => { await Promise.resolve(); });
    const before = mockedAxios.get.mock.calls.length;

    await act(async () => { jest.advanceTimersByTime(60_000); });
    await act(async () => { window.dispatchEvent(new Event('crafting-order-updated')); });

    expect(mockedAxios.get.mock.calls.length).toBeGreaterThan(before);
    jest.useRealTimers();
  });
});
