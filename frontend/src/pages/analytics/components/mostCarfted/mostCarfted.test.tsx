import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import MostCrafted from './mostCarfted';
import { httpError, mockGet } from '../../../../test-utils/http';

const names = () => screen.queryAllByRole('heading', { level: 4 }).map((h) => h.textContent);

describe('MostCrafted', () => {
  it('totals completed quantities per item from the orders, highest first', async () => {
    mockGet({
      '/Order': [
        { status: 'Complete', itemName: 'Steel Workbench 1800mm', quantity: 6 },
        { status: 'completed', ItemName: 'Pallet Rack Frame', Quantity: 15 },
        { status: 'Complete', itemName: 'Steel Workbench 1800mm', quantity: 5 },
        { status: 'Complete', itemName: 'Lifting Sling Assembly', quantity: 2 },
        { status: 'Active', itemName: 'Steel Workbench 1800mm', quantity: 100 },
        { status: 'Complete', itemName: '  ', quantity: 3 },
        { status: 'Complete', itemName: 'Zero Qty', quantity: 0 },
        { status: 'Complete' },
        {},
      ],
    });

    render(<MostCrafted />);

    await waitFor(() => expect(names()).toEqual(['Pallet Rack Frame', 'Steel Workbench 1800mm', 'Lifting Sling Assembly']));
    expect(screen.getByText('11')).toBeInTheDocument();
  });

  it('can sort lowest first', async () => {
    mockGet({ '/Order': [{ status: 'Complete', itemName: 'A', quantity: 5 }, { status: 'Complete', itemName: 'B', quantity: 1 }] });
    render(<MostCrafted />);
    await waitFor(() => expect(names()).toEqual(['A', 'B']));

    fireEvent.click(screen.getByRole('button', { name: 'Most crafted sort order' }));
    fireEvent.click(screen.getByRole('option', { name: 'Low to high' }));

    expect(names()).toEqual(['B', 'A']);
  });

  it('shows an empty state when nothing has been completed or loading fails', async () => {
    mockGet({ '/Order': null });
    const { unmount } = render(<MostCrafted />);
    expect(await screen.findByText('No completed craft data available yet.')).toBeInTheDocument();
    unmount();

    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ '/Order': httpError(500) });
    render(<MostCrafted />);
    await waitFor(() => expect(error).toHaveBeenCalledWith('Unable to load most crafted blueprints', expect.anything()));
    expect(screen.getByText('No completed craft data available yet.')).toBeInTheDocument();
  });
});
