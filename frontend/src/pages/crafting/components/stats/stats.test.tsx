import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import StatsGrid from './stats';
import { httpError, mockGet } from '../../../../test-utils/http';
import { ordersFixture } from '../../../../test-utils/fixtures';

const value = (label: string) => screen.getByText(label, { selector: '.stat-label' }).nextSibling;

describe('StatsGrid', () => {
  it('counts recipes and orders by status from the backend', async () => {
    mockGet({
      '/Item/item/allItemBlueprints': [{ itemID: 30 }, { itemID: 31 }, { itemID: 32 }],
      '/Order': [...ordersFixture, { status: ' COMPLETED ' }, { status: 'Cancelled' }, { status: 'canceled' }, {}],
    });

    render(<StatsGrid />);

    await waitFor(() => expect(value('Recipes')).toHaveTextContent('3'));
    expect(value('Active Jobs')).toHaveTextContent('1');
    expect(value('Completed')).toHaveTextContent('2');
    expect(value('Cancelled')).toHaveTextContent('2');
  });

  it('shows zeros for empty or unexpected responses', async () => {
    mockGet({ '/Item/item/allItemBlueprints': { not: 'a list' }, '/Order': null });

    render(<StatsGrid />);

    await waitFor(() => expect(value('Recipes')).toHaveTextContent('0'));
    expect(value('Active Jobs')).toHaveTextContent('0');
  });

  it('handles a null blueprint response', async () => {
    mockGet({ '/Item/item/allItemBlueprints': null, '/Order': [] });

    render(<StatsGrid />);

    await waitFor(() => expect(value('Recipes')).toHaveTextContent('0'));
  });

  it('logs and keeps zeros when loading fails', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ '/Item/item/allItemBlueprints': httpError(500), '/Order': [] });

    render(<StatsGrid />);

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load crafting stats', expect.anything()));
    expect(value('Completed')).toHaveTextContent('0');
  });

  it('tilts a card on hover and resets on leave', () => {
    mockGet({ '/Item/item/allItemBlueprints': [], '/Order': [] });
    const { container } = render(<StatsGrid />);
    const card = container.querySelector('.info-card') as HTMLElement;
    card.getBoundingClientRect = () => ({ left: 0, top: 0, width: 100, height: 100 } as DOMRect);

    fireEvent.mouseMove(card, { clientX: 75, clientY: 25 });
    expect(card.style.transform).toContain('scale(1.02)');

    fireEvent.mouseLeave(card);
    expect(card.style.transform).toBe('');
  });
});
