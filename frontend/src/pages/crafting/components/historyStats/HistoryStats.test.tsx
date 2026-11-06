import { render, screen, waitFor } from '@testing-library/react';
import HistoryStats from './historyStats';
import { httpError, mockGet } from '../../../../test-utils/http';

const value = (label: string) => screen.getByText(label, { selector: '.history-label' }).nextSibling;

const order = (status: string, quantity: number, created?: string | null, completed?: string | null) =>
  ({ orderID: Math.random(), status, quantity, createdDateTime: created, completedDateTime: completed });

describe('HistoryStats', () => {
  it('counts queued jobs and sums cancelled and completed quantities from the orders', async () => {
    mockGet({
      '/Order': [
        order('Queued', 5), order('queued', 2),
        order('Cancelled', 3), order('Cancelled', 4),
        order('Complete', 6, '2026-11-01T08:00:00Z', '2026-11-01T08:30:00Z'),
        order('completed', 2, '2026-11-01T08:00:00Z', '2026-11-01T09:30:00Z'),
        order('Active', 9),
        { orderID: 99, quantity: 1 },
      ],
    });

    render(<HistoryStats />);

    await waitFor(() => expect(value('Total Jobs')).toHaveTextContent('2'));
    expect(value('Cancelled')).toHaveTextContent('7');
    expect(value('Completed')).toHaveTextContent('8');
    expect(value('Avg Duration')).toHaveTextContent('1h'); // (30 + 90) / 2 = 60 min
  });

  it.each([
    [['2026-11-01T08:00:00Z', '2026-11-01T08:00:20Z'], '<1m'],
    [['2026-11-01T08:00:00Z', '2026-11-01T08:45:00Z'], '45m'],
    [['2026-11-01T08:00:00Z', '2026-11-01T10:15:00Z'], '2h 15m'],
  ])('formats the average duration (%#)', async ([created, completed], expected) => {
    mockGet({ '/Order': [order('Complete', 1, created, completed)] });

    render(<HistoryStats />);

    await waitFor(() => expect(value('Avg Duration')).toHaveTextContent(expected));
  });

  it('ignores completed orders with missing or invalid timestamps', async () => {
    mockGet({
      '/Order': [
        order('Complete', 1, null, '2026-11-01T08:00:00Z'),
        order('Complete', 1, 'not-a-date', '2026-11-01T08:00:00Z'),
        order('Complete', 1, '2026-11-01T09:00:00Z', '2026-11-01T08:00:00Z'),
        { orderID: 5, status: 'Complete' },
      ],
    });

    render(<HistoryStats />);

    await waitFor(() => expect(value('Completed')).toHaveTextContent('3'));
    expect(value('Avg Duration')).toHaveTextContent('N/A');
  });

  it('keeps the defaults when the orders can’t be loaded or are empty', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ '/Order': httpError(500) });
    const { unmount } = render(<HistoryStats />);
    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load history stats', expect.anything()));
    expect(value('Total Jobs')).toHaveTextContent('0');
    expect(value('Avg Duration')).toHaveTextContent('N/A');
    unmount();

    mockGet({ '/Order': null });
    render(<HistoryStats />);
    await waitFor(() => expect(value('Completed')).toHaveTextContent('0'));
  });
});
