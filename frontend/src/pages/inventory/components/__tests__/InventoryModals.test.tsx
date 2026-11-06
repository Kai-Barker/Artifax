import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import InventoryItemCreateModal from '../InventoryItemCreateModal';
import InventoryItemIngredientModal from '../InventoryItemIngredientModal';
import InventoryMaterialsPopover from '../InventoryMaterialsPopover';
import type { InventoryMaterialDetails } from '../../../../services/inventoryApi';
import { httpError, mockedAxios, mockGet } from '../../../../test-utils/http';
import { inventoryRowsFixture, itemsFixture, workbenchBlueprintFixture } from '../../../../test-utils/fixtures';

const field = (label: string) => screen.getByText(label).closest('label')!.querySelector('input, select') as HTMLInputElement;

describe('InventoryItemCreateModal', () => {
  const setup = (props: Partial<React.ComponentProps<typeof InventoryItemCreateModal>> = {}) => {
    const onCreate = jest.fn().mockResolvedValue({ itemID: 40, itemName: 'Pallet Rack Frame', itemCategory: 'Metals', productionTime: 50 });
    const onClose = jest.fn();
    render(<InventoryItemCreateModal open saving={false} categoryOptions={['Metals', 'Fasteners']} onClose={onClose} onCreate={onCreate} {...props} />);
    return { onCreate, onClose };
  };

  it('submits the entered item, defaulting to the first category', async () => {
    const { onCreate } = setup();

    fireEvent.change(field('Item name'), { target: { value: 'Pallet Rack Frame' } });
    fireEvent.change(field('Production time'), { target: { value: '50' } });
    fireEvent.change(field('Price (ZAR)'), { target: { value: '7300' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ itemName: 'Pallet Rack Frame', itemCategory: 'Metals', productionTime: 50, price: 7300 }));
  });

  it('lets the user pick another category and clear the price', async () => {
    const { onCreate } = setup();
    fireEvent.change(field('Item name'), { target: { value: 'Hex Nut' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select item category' }));
    fireEvent.click(screen.getByRole('option', { name: 'Fasteners' }));
    fireEvent.change(field('Price (ZAR)'), { target: { value: '1' } });
    fireEvent.change(field('Price (ZAR)'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ itemCategory: 'Fasteners', price: null })));
  });

  it('starts with an empty category when there are no categories yet', async () => {
    const { onCreate } = setup({ categoryOptions: [] });
    fireEvent.change(field('Item name'), { target: { value: 'First item' } });

    fireEvent.click(screen.getByRole('button', { name: 'Create item' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({ itemCategory: '' })));
  });

  it('shows the saving state and blocks a second submit', () => {
    setup({ saving: true });

    expect(screen.getByRole('button', { name: 'Saving...' })).toBeDisabled();
  });

  it('closes on Escape, the close buttons, or a backdrop click — but not a click inside', () => {
    const { onClose } = setup();

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.mouseDown(screen.getByRole('presentation'));
    screen.getAllByRole('button', { name: /close|cancel/i }).forEach((button) => fireEvent.click(button));
    expect(onClose.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('renders nothing when closed', () => {
    setup({ open: false });

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('InventoryItemIngredientModal', () => {
  const workbench = { itemID: 30, itemName: 'Steel Workbench 1800mm', itemCategory: 'Furniture', productionTime: 45 };

  function mockBackend(blueprint: unknown = workbenchBlueprintFixture) {
    mockGet({
      'Item/item/': itemsFixture,
      'Item/item/30': itemsFixture[3],
      'Item/itemIngredient/item/30': blueprint,
      'Item/item/allInventoryItems': inventoryRowsFixture,
    });
  }

  it('lists the current recipe from the backend and offers every other item as an ingredient', async () => {
    mockBackend();

    render(<InventoryItemIngredientModal item={workbench} open onClose={jest.fn()} />);

    expect(await screen.findByText('Hex Bolt M10', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('x16')).toBeInTheDocument();
    const options = within(field('Ingredient item') as unknown as HTMLElement).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['Select an item', 'Emergency Stop Button · Electronics', 'Hex Bolt M10 · Fasteners', 'Steel Sheet 2mm · Metals']);
    expect(screen.getByText('Production time: 45s')).toBeInTheDocument();
  });

  it('shows an empty recipe when the item has no ingredients yet', async () => {
    mockBackend(httpError(404));

    render(<InventoryItemIngredientModal item={workbench} open onClose={jest.fn()} />);

    expect(await screen.findByText('No ingredients have been attached yet.')).toBeInTheDocument();
  });

  it('adds an ingredient and reloads the recipe', async () => {
    mockBackend([]);
    mockedAxios.post.mockImplementation(async () => {
      mockBackend([{ ingredientID: 20, itemName: 'Emergency Stop Button', itemCategory: 'Electronics', quantity: 2 }]);
      return { data: {} };
    });
    render(<InventoryItemIngredientModal item={workbench} open onClose={jest.fn()} />);
    await screen.findByText('No ingredients have been attached yet.');

    fireEvent.change(field('Ingredient item'), { target: { value: '20' } });
    fireEvent.change(field('Quantity needed'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));

    expect(await screen.findByText('x2')).toBeInTheDocument();
    expect(mockedAxios.post).toHaveBeenCalledWith('Item/itemIngredient/', { ProductID: 30, IngredientID: 20, IngredientQuantity: 2 });
    expect(field('Ingredient item').value).toBe('');
  });

  it('does nothing when no ingredient is chosen', () => {
    mockBackend([]);
    render(<InventoryItemIngredientModal item={workbench} open onClose={jest.fn()} />);
    fireEvent.change(field('Ingredient item'), { target: { value: '20' } });
    fireEvent.change(field('Ingredient item'), { target: { value: '' } });

    fireEvent.submit(screen.getByRole('button', { name: 'Add ingredient' }).closest('form')!);

    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('logs when adding fails and lets the user try again', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend([]);
    mockedAxios.post.mockRejectedValue(httpError(500));
    render(<InventoryItemIngredientModal item={workbench} open onClose={jest.fn()} />);
    await screen.findByText('No ingredients have been attached yet.');

    fireEvent.change(field('Ingredient item'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add ingredient' }));

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to add ingredient to item', expect.anything()));
    expect(screen.getByRole('button', { name: 'Add ingredient' })).toBeEnabled();
  });

  it('logs when the editor data can’t load', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ 'Item/item/': httpError(500) });

    render(<InventoryItemIngredientModal item={workbench} open onClose={jest.fn()} />);

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load ingredient editor data', expect.anything()));
    expect(await screen.findByText('No ingredients have been attached yet.')).toBeInTheDocument();
  });

  it('closes on Escape, Done, Finish and the backdrop, but not other keys or inside clicks', async () => {
    mockBackend([]);
    const onClose = jest.fn();
    render(<InventoryItemIngredientModal item={workbench} open onClose={onClose} />);
    await screen.findByText('No ingredients have been attached yet.');

    fireEvent.keyDown(document, { key: 'Tab' });
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    fireEvent.mouseDown(screen.getByRole('presentation'));
    expect(onClose).toHaveBeenCalledTimes(4);
  });

  it('renders nothing when closed or without an item', () => {
    const { rerender } = render(<InventoryItemIngredientModal item={workbench} open={false} onClose={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender(<InventoryItemIngredientModal item={null} open onClose={jest.fn()} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(mockedAxios.get).not.toHaveBeenCalled();
  });
});

describe('InventoryMaterialsPopover', () => {
  const details: InventoryMaterialDetails = {
    itemId: 30,
    itemName: 'Steel Workbench 1800mm',
    category: 'Furniture',
    productionTime: 45,
    ingredients: [
      { ingredientId: 1, name: 'Steel Sheet 2mm', category: 'Metals', requiredQuantity: 2, availableQuantity: 150, branches: [{ branchName: 'Main Branch', quantity: 140 }, { branchName: 'Durban Assembly Plant', quantity: 10 }] },
      { ingredientId: 6, name: 'Hex Bolt M10', category: 'Fasteners', requiredQuantity: 16, availableQuantity: 4, branches: [{ branchName: 'Main Branch', quantity: 4 }] },
      { ingredientId: 9, name: 'Rubber Gasket', category: 'Others', requiredQuantity: 1, availableQuantity: 0, branches: [] },
    ],
  };

  it('shows each ingredient with required, available and missing stock, plus branch totals', () => {
    render(<InventoryMaterialsPopover details={details} loading={false} compact />);

    expect(screen.getByText('Furniture · Production time 45s')).toBeInTheDocument();
    expect(screen.getByText('3 ingredients')).toBeInTheDocument();
    // Durban appears in the branch summary and in Steel Sheet's own branch list.
    expect(screen.getAllByText('Durban Assembly Plant: 10')).toHaveLength(2);
    // The summary totals Main Branch across ingredients (140 + 4).
    expect(screen.getByText('Main Branch: 144')).toBeInTheDocument();
    expect(screen.getByText('Missing: 12')).toBeInTheDocument();
    expect(screen.getByText('Missing: 0')).toBeInTheDocument();
    expect(screen.getByText('No branch stock recorded for this ingredient.')).toBeInTheDocument();
  });

  it('says when no branch totals exist yet', () => {
    render(<InventoryMaterialsPopover details={{ ...details, ingredients: [details.ingredients[2]] }} loading={false} />);

    expect(screen.getByText('No branch totals are available yet.')).toBeInTheDocument();
  });

  it('shows loading and empty states', () => {
    const { rerender } = render(<InventoryMaterialsPopover details={null} loading />);
    expect(screen.getByText('Fetching')).toBeInTheDocument();
    expect(screen.getByText('Loading live ingredient availability...')).toBeInTheDocument();

    rerender(<InventoryMaterialsPopover details={null} loading={false} />);
    expect(screen.getByText('No data')).toBeInTheDocument();
    expect(screen.getByText('No blueprint ingredients were found for this item.')).toBeInTheDocument();

    rerender(<InventoryMaterialsPopover details={{ ...details, ingredients: [] }} loading={false} />);
    expect(screen.getByText('0 ingredients')).toBeInTheDocument();
  });
});
