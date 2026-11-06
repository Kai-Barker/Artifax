import React from 'react';
import { render, screen } from '@testing-library/react';
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
});