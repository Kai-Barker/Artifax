import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import InventoryItemEditModal from '../InventoryItemEditModal';
import { InventoryItem } from '../../../../services/inventoryApi';

describe('InventoryItemEditModal', () => {
  it('renders category select options and submits price and quantity changes', async () => {
    const onClose = jest.fn();
    const onSave = jest.fn().mockResolvedValue(undefined);
    const item: InventoryItem = {
      id: '7',
      name: 'Blue plastic table',
      sku: 'TAB-7',
      category: 'Plastic Tables',
      quantity: 5,
      price: 199.99,
      minStock: 5,
      location: 'Johannesburg',
      branchId: 2,
      status: 'LOW',
      productionTime: 50,
    };

    render(
      <InventoryItemEditModal
        item={item}
        open
        saving={false}
        categoryOptions={['Furniture', 'Metals']}
        onClose={onClose}
        onSave={onSave}
      />,
    );

    const categoryButton = screen.getByRole('button', { name: /select item category/i });
    expect(categoryButton).toHaveTextContent('Plastic Tables');

    await userEvent.clear(screen.getByLabelText(/price \(zar\)/i));
    await userEvent.type(screen.getByLabelText(/price \(zar\)/i), '249.5');
    expect(screen.getByTestId('edit-item-branch')).toHaveTextContent('Johannesburg');
    await userEvent.clear(screen.getByLabelText(/total quantity/i));
    await userEvent.type(screen.getByLabelText(/total quantity/i), '12');
    await userEvent.click(categoryButton);
    await userEvent.click(screen.getByRole('option', { name: 'Metals' }));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSave).toHaveBeenCalledWith(7, expect.objectContaining({ itemCategory: 'Metals', price: 249.5, quantity: 12, branchId: 2 }));
  });

  const baseItem: InventoryItem = {
    id: '20', name: 'Emergency Stop Button', sku: 'ELE-20', category: 'Electronics', quantity: 4, price: null,
    minStock: 5, location: 'Durban Assembly Plant', branchId: 3, status: 'LOW', productionTime: 2,
  };

  it('saves name and production time edits, and an emptied price as null', async () => {
    const onSave = jest.fn().mockResolvedValue(undefined);
    render(<InventoryItemEditModal item={baseItem} open saving={false} categoryOptions={['Electronics']} onClose={jest.fn()} onSave={onSave} />);

    await userEvent.clear(screen.getByLabelText(/item name/i));
    await userEvent.type(screen.getByLabelText(/item name/i), 'E-Stop');
    await userEvent.clear(screen.getByLabelText(/production time/i));
    await userEvent.type(screen.getByLabelText(/production time/i), '3');
    await userEvent.type(screen.getByLabelText(/price \(zar\)/i), '5');
    await userEvent.clear(screen.getByLabelText(/price \(zar\)/i));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSave).toHaveBeenCalledWith(20, expect.objectContaining({ itemName: 'E-Stop', productionTime: 3, price: null }));
  });

  it('keeps an item’s category even when it isn’t in the known list', async () => {
    render(<InventoryItemEditModal item={{ ...baseItem, category: 'Hydraulics' }} open saving={false} categoryOptions={['Electronics']} onClose={jest.fn()} onSave={jest.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /select item category/i }));

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Hydraulics', 'Electronics']);
  });

  it('shows the saving state', () => {
    render(<InventoryItemEditModal item={baseItem} open saving categoryOptions={[]} onClose={jest.fn()} onSave={jest.fn()} />);

    expect(screen.getByRole('button', { name: /saving/i })).toBeDisabled();
  });

  it('closes on Escape, Close, Cancel or a backdrop click — not on other keys or clicks inside', () => {
    const onClose = jest.fn();
    render(<InventoryItemEditModal item={baseItem} open saving={false} categoryOptions={[]} onClose={onClose} onSave={jest.fn()} />);

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it('renders nothing when closed or without an item', () => {
    const { rerender } = render(<InventoryItemEditModal item={baseItem} open={false} saving={false} categoryOptions={[]} onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<InventoryItemEditModal item={null} open saving={false} categoryOptions={[]} onClose={jest.fn()} onSave={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});