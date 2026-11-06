import { fireEvent, render, screen, within } from '@testing-library/react';
import AlertStrip from '../AlertStrip';
import type { InventoryItem } from '../../../services/inventoryApi';
import { adminUser, signIn } from '../../../test-utils/fixtures';

// Inventory rows as the API layer produces them (one per item per branch).
const row = (id: string, name: string, quantity: number, branchId: number, location: string): InventoryItem => ({
  id, name, sku: `X-${id}`, category: 'Electronics', quantity, price: null, minStock: 5,
  location, branchId, status: quantity <= 5 ? 'LOW' : 'OK', productionTime: 1,
});

const items = [
  row('20', 'Emergency Stop Button', 2, 1, 'Main Branch'),
  row('20', 'Emergency Stop Button', 4, 3, 'Durban Assembly Plant'),
  row('20', 'Emergency Stop Button', 1, 2, 'Johannesburg Fabrication Plant'),
  row('15', 'PLC Controller Module', 3, 3, 'Durban Assembly Plant'),
  row('1', 'Steel Sheet 2mm', 140, 1, 'Main Branch'),
];

describe('AlertStrip', () => {
  it('defaults to the logged-in user’s branch and lists only its low stock', () => {
    signIn();

    render(<AlertStrip items={items} />);

    expect(screen.getByText('Low Stock · Main Branch: 1')).toBeInTheDocument();
    expect(screen.getByText('Emergency Stop Button')).toBeInTheDocument();
    expect(screen.getByText('· 2 left')).toBeInTheDocument();
    expect(screen.queryByText('PLC Controller Module')).not.toBeInTheDocument();
    expect(screen.queryByText('Steel Sheet 2mm')).not.toBeInTheDocument();
  });

  it('shows a calm message when the branch has no low stock', () => {
    signIn({ ...adminUser, branchId: 9, branchName: 'Cape Town Components Plant' });

    render(<AlertStrip items={items} />);

    expect(screen.getByText('Low Stock · Cape Town Components Plant: 0')).toBeInTheDocument();
    expect(screen.getByText('Everything at this branch is above minimum stock.')).toBeInTheDocument();
  });

  it('falls back to the branch name from the data, then a generic label', () => {
    signIn({ ...adminUser, branchName: undefined, branchId: 3 });
    const { unmount } = render(<AlertStrip items={items} />);
    expect(screen.getByText('Low Stock · Durban Assembly Plant: 2')).toBeInTheDocument();
    unmount();

    signIn({ ...adminUser, branchName: undefined, branchId: 9 });
    render(<AlertStrip items={items} />);
    expect(screen.getByText('Low Stock · My branch: 0')).toBeInTheDocument();
  });

  it('groups each item once in the all-branches view, most urgent first', () => {
    signIn();
    render(<AlertStrip items={items} />);

    fireEvent.click(screen.getByRole('button', { name: 'All branches' }));

    expect(screen.getByText('Low Stock · All branches: 2')).toBeInTheDocument();
    const chips = screen.getAllByRole('button', { expanded: false });
    expect(chips.map((chip) => chip.textContent)).toEqual([
      'Emergency Stop Button3 sites▾',
      'PLC Controller Module3 left▾',
    ]);
    expect(window.localStorage.getItem('artifax.lowStockScope')).toBe('all');
  });

  it('opens a per-branch breakdown with the user’s branch highlighted, and closes it again', () => {
    signIn();
    render(<AlertStrip items={items} />);
    fireEvent.click(screen.getByRole('button', { name: 'All branches' }));

    const chip = screen.getByRole('button', { name: /Emergency Stop Button/ });
    fireEvent.click(chip);

    const breakdown = screen.getByRole('dialog', { name: 'Emergency Stop Button stock by branch' });
    const sites = within(breakdown).getAllByRole('listitem').map((li) => li.textContent);
    expect(sites).toEqual([
      'Johannesburg Fabrication Plant1 left',
      'Main Branch(your branch)2 left',
      'Durban Assembly Plant4 left',
    ]);

    fireEvent.click(chip);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('closes the breakdown on Escape or an outside click, but not on other keys or inside clicks', () => {
    signIn();
    render(<div><AlertStrip items={items} /><p>outside</p></div>);
    fireEvent.click(screen.getByRole('button', { name: 'All branches' }));
    fireEvent.click(screen.getByRole('button', { name: /Emergency Stop Button/ }));

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Emergency Stop Button/ }));
    fireEvent.mouseDown(screen.getByText('outside'));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('remembers the chosen scope and can switch back', () => {
    signIn();
    window.localStorage.setItem('artifax.lowStockScope', 'all');
    render(<AlertStrip items={items} />);
    expect(screen.getByText('Low Stock · All branches: 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'My branch' }));

    expect(screen.getByText('Low Stock · Main Branch: 1')).toBeInTheDocument();
    expect(window.localStorage.getItem('artifax.lowStockScope')).toBe('mine');
  });

  it('shows every branch, with no toggle, when nobody is logged in', () => {
    render(<AlertStrip items={items} />);

    expect(screen.getByText('Low Stock · All branches: 2')).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Low stock scope' })).not.toBeInTheDocument();
  });

  it('reports no low stock anywhere when everything is above minimum', () => {
    render(<AlertStrip items={[row('1', 'Steel Sheet 2mm', 140, 1, 'Main Branch')]} />);

    expect(screen.getByText('No low stock anywhere.')).toBeInTheDocument();
  });

  it('still works when browser storage is unavailable', () => {
    signIn();
    const getItem = jest.spyOn(Storage.prototype, 'getItem');
    const setItem = jest.spyOn(Storage.prototype, 'setItem');
    render(<AlertStrip items={items} />);
    getItem.mockImplementation(() => { throw new Error('blocked'); });
    setItem.mockImplementation(() => { throw new Error('blocked'); });

    fireEvent.click(screen.getByRole('button', { name: 'All branches' }));

    expect(screen.getByText('Low Stock · All branches: 2')).toBeInTheDocument();
    getItem.mockRestore();
    setItem.mockRestore();
  });

  it('defaults to "My branch" when stored scope cannot be read', () => {
    signIn();
    const getItem = jest.spyOn(Storage.prototype, 'getItem').mockImplementation((key: string) => {
      if (key === 'artifax.lowStockScope') throw new Error('blocked');
      return key === 'artifax.currentUser' ? JSON.stringify(adminUser) : null;
    });

    render(<AlertStrip items={items} />);

    expect(screen.getByText('Low Stock · Main Branch: 1')).toBeInTheDocument();
    getItem.mockRestore();
  });
});
