import { render, screen, waitFor } from '@testing-library/react';
import AnalyticsPage from './analytics';
import { httpError, mockGet } from '../../test-utils/http';
import { inventoryRowsFixture } from '../../test-utils/fixtures';

// The page's sections have their own tests.
jest.mock('./components/graph/graph', () => () => <div>Graph section</div>);
jest.mock('./components/mostCarfted/mostCarfted', () => () => <div>Most crafted section</div>);
jest.mock('../crafting/components/stats/stats', () => () => <div>Stats section</div>);
jest.mock('../../components/layout/AlertStrip', () => ({
  __esModule: true,
  default: ({ items }: any) => <div>Low-stock rows: {items.length}</div>,
}));

describe('AnalyticsPage', () => {
  it('lays out the sections and feeds inventory to the low-stock strip', async () => {
    mockGet({ 'Item/item/allInventoryItems': inventoryRowsFixture });

    render(<AnalyticsPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Analytics' })).toBeInTheDocument();
    expect(screen.getByText('Graph section')).toBeInTheDocument();
    expect(screen.getByText('Most crafted section')).toBeInTheDocument();
    expect(screen.getByText('Stats section')).toBeInTheDocument();
    expect(await screen.findByText('Low-stock rows: 5')).toBeInTheDocument();
  });

  it('logs and shows no alerts when inventory can’t be loaded', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ 'Item/item/allInventoryItems': httpError(500) });

    render(<AnalyticsPage />);

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load analytics low stock alerts', expect.anything()));
    expect(screen.getByText('Low-stock rows: 0')).toBeInTheDocument();
  });
});
