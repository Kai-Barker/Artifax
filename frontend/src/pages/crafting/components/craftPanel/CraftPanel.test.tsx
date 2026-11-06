import { fireEvent, render, screen } from '@testing-library/react';
import CraftPanel from './craftPanel';
import type { Blueprint } from '../craftingData';

// A blueprint as the crafting page builds it from backend data.
const workbench: Blueprint = {
  id: 'bp-30',
  name: 'Steel Workbench 1800mm',
  description: 'Production time: 45s',
  category: 'furniture',
  have: 14,
  craft: 0,
  productionTime: 45,
  materials: [
    { itemId: 1, name: 'Steel Sheet 2mm', need: 2, have: 5 },
    { itemId: 6, name: 'Hex Bolt M10', need: 16, have: 4800 },
  ],
};

function setup(props: Partial<React.ComponentProps<typeof CraftPanel>> = {}) {
  const handlers = {
    onAmountChange: jest.fn(),
    onToggleExpedite: jest.fn(),
    onCraft: jest.fn().mockResolvedValue(undefined),
    onEdit: jest.fn(),
    onDelete: jest.fn(),
  };
  render(<CraftPanel blueprint={workbench} amount={1} orderExpedite={false} {...handlers} {...props} />);
  return handlers;
}

const materialRow = (name: string) => screen.getByText(name).closest('.material-row') as HTMLElement;

describe('CraftPanel', () => {
  it('shows the blueprint, stock on hand and material needs for the amount', () => {
    setup({ amount: 2 });

    expect(screen.getByRole('heading', { name: 'Steel Workbench 1800mm' })).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(screen.getByText('32 / 4800')).toBeInTheDocument();
    expect(screen.getByText('Estimated craft time: 90min')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Craft Item' })).toBeEnabled();
  });

  it('flags missing materials and blocks crafting when stock is short', () => {
    const { onCraft } = setup({ amount: 3 });

    expect(materialRow('Steel Sheet 2mm')).toHaveClass('material-missing');
    expect(screen.getByText('Insufficient quantity')).toBeInTheDocument();
    expect(materialRow('Hex Bolt M10')).not.toHaveClass('material-missing');
    const craft = screen.getByRole('button', { name: 'Craft Item' });
    expect(craft).toBeDisabled();
    fireEvent.click(craft);
    expect(onCraft).not.toHaveBeenCalled();
  });

  it('halves the estimate when expedited', () => {
    setup({ amount: 3, orderExpedite: true, blueprint: { ...workbench, materials: [] } });

    expect(screen.getByText('Estimated craft time: 68min (expedited)')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Order Expedite' })).toBeChecked();
  });

  it('falls back to the craft value when there is no production time', () => {
    setup({ blueprint: { ...workbench, productionTime: undefined, craft: 7 } });

    expect(screen.getByText('Estimated craft time: 7min')).toBeInTheDocument();
  });

  it('changes the amount with the buttons and input, never below 1', () => {
    const { onAmountChange } = setup({ amount: 2 });

    fireEvent.click(screen.getByRole('button', { name: '+' }));
    fireEvent.click(screen.getByRole('button', { name: '-' }));
    fireEvent.change(screen.getByLabelText('Craft amount'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Craft amount'), { target: { value: '-3' } });

    expect(onAmountChange.mock.calls).toEqual([[3], [1], [5], [1]]);
  });

  it('ignores a non-numeric amount and keeps the minimum at 1', () => {
    const { onAmountChange } = setup({ amount: 1 });
    const input = screen.getByLabelText('Craft amount') as HTMLInputElement;

    // jsdom keeps number inputs numeric, so feed a NaN value directly through the change event.
    Object.defineProperty(input, 'value', { configurable: true, get: () => 'abc', set: () => {} });
    fireEvent.change(input);
    fireEvent.click(screen.getByRole('button', { name: '-' }));

    expect(onAmountChange.mock.calls).toEqual([[1]]);
  });

  it('crafts, toggles expedite, edits and deletes', () => {
    const handlers = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Craft Item' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Order Expedite' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Blueprint' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete Blueprint' }));

    expect(handlers.onCraft).toHaveBeenCalled();
    expect(handlers.onToggleExpedite).toHaveBeenCalled();
    expect(handlers.onEdit).toHaveBeenCalled();
    expect(handlers.onDelete).toHaveBeenCalled();
  });
});
