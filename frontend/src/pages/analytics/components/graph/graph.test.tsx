import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import GraphCard from './graph';
import { httpError, mockGet } from '../../../../test-utils/http';

// Render the chart's data instead of a canvas so the numbers can be asserted.
jest.mock('react-chartjs-2', () => ({
  Line: ({ data, options }: any) => (
    <div>
      <p data-testid="labels">{data.labels.join(',')}</p>
      <p data-testid="quantity">{data.datasets[0].data.join(',')}</p>
      <p data-testid="revenue">{data.datasets[1].data.join(',')}</p>
      <p data-testid="grid">{options.scales.y.grid.color}</p>
    </div>
  ),
}));

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();

// GET /Item/item/ (camelCase, as the API returns it), plus messy rows that must be ignored.
const items = [
  { itemID: 30, itemName: 'Steel Workbench 1800mm', price: 8900 },
  { ItemID: 37, ItemName: 'Pallet Rack Frame', Price: 7300 },
  { id: 38, itemName: 'Lifting Sling Assembly' },
  { itemID: 0, itemName: 'No id' },
  { itemID: 39, itemName: '' },
];

const orders = [
  { orderID: 1, status: 'Complete', itemName: 'Steel Workbench 1800mm', quantity: 2, completedDateTime: daysAgo(0) },
  { orderID: 2, status: 'completed', itemName: 'steel workbench 1800mm', quantity: 3, startedDateTime: daysAgo(1) },
  { orderID: 3, status: 'Complete', itemName: 'Steel Workbench 1800mm', quantity: 1, createdDateTime: daysAgo(1) },
  { orderID: 4, status: 'Active', itemName: 'Steel Workbench 1800mm', quantity: 50, completedDateTime: daysAgo(0) },
  { orderID: 5, status: 'Complete', itemName: 'Pallet Rack Frame', quantity: 10, completedDateTime: daysAgo(0) },
  { orderID: 6, status: 'Complete', itemName: 'Steel Workbench 1800mm', quantity: 4, completedDateTime: daysAgo(20) },
  { orderID: 7, status: 'Complete', itemName: 'Steel Workbench 1800mm', quantity: 9, completedDateTime: daysAgo(400) },
  { orderID: 8, status: 'Complete', itemName: 'Steel Workbench 1800mm', quantity: 1, completedDateTime: 'garbage' },
  { orderID: 9, status: 'Complete', itemName: 'Steel Workbench 1800mm', quantity: 0, completedDateTime: daysAgo(0) },
  { orderID: 10, status: 'Complete', quantity: 1, completedDateTime: daysAgo(0) },
  { orderID: 11, status: 'Complete', itemName: 'Steel Workbench 1800mm', quantity: 1 },
];

const series = (id: string) => screen.getByTestId(id).textContent!.split(',').map(Number);
const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

async function renderGraph() {
  jest.spyOn(Math, 'random').mockReturnValue(0); // pick the first item
  mockGet({ '/Order': orders, '/Item/item/': items });
  render(<GraphCard />);
  await screen.findByTestId('quantity');
  // The search box fills in with the selected item just after the data loads.
  await waitFor(() => expect(screen.getByLabelText('Search blueprint')).toHaveValue('Steel Workbench 1800mm'));
}

describe('GraphCard', () => {
  it('charts completed quantity and revenue per day for the selected item over the last week', async () => {
    await renderGraph();

    expect(screen.getByLabelText('Search blueprint')).toHaveValue('Steel Workbench 1800mm');
    const quantity = series('quantity');
    expect(quantity).toHaveLength(7);
    expect(quantity[6]).toBe(2); // today
    expect(quantity[5]).toBe(4); // yesterday (started + created dates)
    expect(sum(quantity)).toBe(6);
    expect(series('revenue')[6]).toBe(17800);
  });

  it('groups by week for the month view and by month for the 4-month view', async () => {
    await renderGraph();

    fireEvent.click(screen.getByRole('button', { name: 'Graph time range' }));
    fireEvent.click(screen.getByRole('option', { name: 'Month' }));
    expect(screen.getByTestId('labels')).toHaveTextContent('Week 1,Week 2,Week 3,Week 4');
    expect(sum(series('quantity'))).toBe(10); // includes the order from 20 days ago

    fireEvent.click(screen.getByRole('button', { name: 'Graph time range' }));
    fireEvent.click(screen.getByRole('option', { name: 'Last 4 months' }));
    expect(series('quantity')).toHaveLength(4);
    expect(sum(series('quantity'))).toBe(10); // the 400-day-old order is out of range
  });

  it('searches and switches to another item', async () => {
    await renderGraph();
    const search = screen.getByLabelText('Search blueprint');

    fireEvent.change(search, { target: { value: 'pallet' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pallet Rack Frame' }));

    expect(search).toHaveValue('Pallet Rack Frame');
    expect(series('quantity')[6]).toBe(10);
    expect(series('revenue')[6]).toBe(73000);
    expect(screen.queryByRole('button', { name: 'Steel Workbench 1800mm' })).not.toBeInTheDocument();
  });

  it('lists every item for an empty search and closes the list on an outside click', async () => {
    await renderGraph();
    const search = screen.getByLabelText('Search blueprint');

    fireEvent.change(search, { target: { value: '' } });
    expect(screen.getAllByRole('button', { name: /Steel Workbench|Pallet Rack|Lifting Sling/ })).toHaveLength(3);

    fireEvent.pointerDown(search);
    expect(screen.getByRole('button', { name: 'Lifting Sling Assembly' })).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('button', { name: 'Lifting Sling Assembly' })).not.toBeInTheDocument();

    fireEvent.focus(search);
    fireEvent.click(screen.getByRole('button', { name: 'Lifting Sling Assembly' }));
    expect(series('revenue').every((v) => v === 0)).toBe(true); // no price, no completed orders
  });

  it('shows nothing selectable when there are no items, and an empty chart', async () => {
    mockGet({ '/Order': null, '/Item/item/': null });
    render(<GraphCard />);

    expect(await screen.findByTestId('quantity')).toHaveTextContent('0,0,0,0,0,0,0');
    expect(screen.getByLabelText('Search blueprint')).toHaveValue('');
  });

  it('shows an error message when loading fails', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ '/Order': httpError(500), '/Item/item/': items });

    render(<GraphCard />);

    expect(screen.getByText('Loading analytics data...')).toBeInTheDocument();
    expect(await screen.findByText('Unable to load analytics data. Please try again later.')).toBeInTheDocument();
  });

  it('re-reads the theme colours when the theme changes', async () => {
    await renderGraph();
    const before = screen.getByTestId('grid').textContent;

    await act(async () => {
      document.documentElement.style.setProperty('--chart-grid', 'rgb(1, 2, 3)');
      document.documentElement.dataset.theme = 'synthwave';
      await Promise.resolve();
    });

    await waitFor(() => expect(screen.getByTestId('grid')).toHaveTextContent('rgb(1, 2, 3)'));
    expect(before).not.toBe('rgb(1, 2, 3)');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.removeProperty('--chart-grid');
  });
});
