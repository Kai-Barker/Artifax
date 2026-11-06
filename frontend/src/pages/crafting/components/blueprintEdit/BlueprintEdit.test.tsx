import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import BlueprintEdit from './BlueprintEdit';
import { showError, showSuccess } from '../../../../utils/toast';
import { httpError, mockedAxios, mockGet } from '../../../../test-utils/http';
import { workbenchBlueprintFixture } from '../../../../test-utils/fixtures';

jest.mock('../../../../utils/toast', () => ({ showError: jest.fn(), showSuccess: jest.fn(), showInfo: jest.fn() }));

// camelCase, as the live API returns ItemReadDto.
const items = [
  { itemID: 1, itemName: 'Steel Sheet 2mm' },
  { itemID: 6, itemName: 'Hex Bolt M10' },
  { itemID: 30, itemName: 'Steel Workbench 1800mm' },
  { itemID: 0 },
];
const workbench = { itemID: 30, itemName: 'Steel Workbench 1800mm', itemCategory: 'furniture', productionTime: 45, price: 8900 };

function mockBackend(overrides: Record<string, unknown> = {}) {
  mockGet({
    '/Item/item/': items,
    '/Item/item/30': workbench,
    '/Item/itemIngredient/item/30': workbenchBlueprintFixture,
    ...overrides,
  });
}

function setup() {
  const onCancel = jest.fn();
  const onSaved = jest.fn();
  render(<BlueprintEdit itemId={30} onCancel={onCancel} onSaved={onSaved} />);
  return { onCancel, onSaved };
}

const loaded = () => screen.findByDisplayValue('Steel Workbench 1800mm');
const materialSelects = () => screen.getAllByRole('button', { name: 'Select material' });

describe('BlueprintEdit', () => {
  it('loads the item and its current materials from the backend', async () => {
    mockBackend();
    setup();
    expect(screen.getByText('Loading blueprint...')).toBeInTheDocument();

    await loaded();

    expect(screen.getByLabelText('Craft Time (min)')).toHaveValue(45);
    expect(screen.getByLabelText('Price (ZAR)')).toHaveValue(8900);
    expect(screen.getByRole('button', { name: 'Select blueprint category' })).toHaveTextContent('Furniture');
    expect(materialSelects().map((b) => b.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('Steel Sheet 2mm'), expect.stringContaining('Hex Bolt M10')]));
    expect(screen.getByText('16', { selector: '.amount-value' })).toBeInTheDocument();
  });

  it('fills defaults for sparse item data', async () => {
    mockBackend({
      '/Item/item/30': { Price: 12 },
      '/Item/itemIngredient/item/30': [{}],
      '/Item/item/': null,
    });
    setup();

    await waitFor(() => expect(screen.getByLabelText('Price (ZAR)')).toHaveValue(12));
    expect(screen.getByLabelText('Blueprint Name')).toHaveValue('');
    expect(screen.getByLabelText('Craft Time (min)')).toHaveValue(1);
    expect(screen.getByRole('button', { name: 'Select blueprint category' })).toHaveTextContent('Metal');
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeDisabled();
  });

  it('handles a missing ingredient list and price', async () => {
    mockBackend({ '/Item/item/30': { itemName: 'Bare Item' }, '/Item/itemIngredient/item/30': null });
    setup();

    expect(await screen.findByDisplayValue('Bare Item')).toBeInTheDocument();
    expect(screen.getByLabelText('Price (ZAR)')).toHaveValue(0);
    expect(screen.queryAllByRole('button', { name: 'Select material' })).toHaveLength(0);
  });

  it('shows an error with a way back when the blueprint can’t be loaded', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend({ '/Item/item/30': httpError(404) });
    const { onCancel } = setup();

    expect(await screen.findByText('Unable to load blueprint data.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('saves the item details and the updated blueprint, creating new materials as needed', async () => {
    mockBackend();
    mockedAxios.put.mockResolvedValue({ data: {} });
    mockedAxios.post.mockResolvedValue({ data: { itemID: 70 } });
    const { onSaved } = setup();
    await loaded();

    fireEvent.change(screen.getByLabelText('Blueprint Name'), { target: { value: '  Steel Workbench XL ' } });
    fireEvent.change(screen.getByLabelText('Craft Time (min)'), { target: { value: '60' } });
    fireEvent.change(screen.getByLabelText('Price (ZAR)'), { target: { value: '9900' } });
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(screen.getByRole('button', { name: '+ Add material to blueprint' }));
    // Fill the newly added third row.
    fireEvent.click(materialSelects()[2]);
    fireEvent.click(screen.getByRole('option', { name: 'Steel Workbench 1800mm' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Blueprint updated successfully. Returning to crafting page.'));
    expect(mockedAxios.put).toHaveBeenCalledWith('/Item/30', { itemName: 'Steel Workbench XL', itemCategory: 'furniture', productionTime: 60, price: 9900 });
    expect(mockedAxios.put).toHaveBeenCalledWith('/Item/item/30/blueprint/edit', {
      itemID: 30,
      productionTime: 60,
      price: 9900,
      ingredients: [
        { ingredientID: 1, ingredientQuantity: 3 },
        { ingredientID: 6, ingredientQuantity: 16 },
        { ingredientID: 30, ingredientQuantity: 1 },
      ],
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it('creates materials that aren’t items yet, and skips any the server can’t create', async () => {
    mockGet({
      '/Item/item/': [{ itemName: 'Gasket' }, { itemName: 'Mystery' }],
      '/Item/item/30': workbench,
      '/Item/itemIngredient/item/30': [{ itemName: 'Gasket', quantity: 2 }, { itemName: 'Gasket', quantity: 1 }, { itemName: 'Mystery', quantity: 1 }],
    });
    mockedAxios.put.mockResolvedValue({ data: {} });
    mockedAxios.post.mockResolvedValueOnce({ data: { itemID: 80 } }).mockResolvedValueOnce({ data: {} });
    setup();
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Item/item/30/blueprint/edit', expect.objectContaining({
      ingredients: [{ ingredientID: 80, ingredientQuantity: 2 }, { ingredientID: 80, ingredientQuantity: 1 }],
    })));
    expect(mockedAxios.post).toHaveBeenCalledTimes(2);
  });

  it('requires a name and at least one material', async () => {
    mockBackend({ '/Item/itemIngredient/item/30': [] });
    setup();
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(showError).toHaveBeenCalledWith('Please add a blueprint name and at least one material.');
    expect(mockedAxios.put).not.toHaveBeenCalled();
  });

  it('reports a failed save and lets the user retry', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend();
    mockedAxios.put.mockRejectedValue(httpError(500));
    const { onSaved } = setup();
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to save blueprint changes. Please try again.'));
    expect(onSaved).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Save Changes' })).toBeEnabled();
  });

  it('edits rows: change category, clear a material, adjust and remove rows, clamp inputs', async () => {
    mockBackend();
    const { onCancel } = setup();
    await loaded();

    fireEvent.click(screen.getByRole('button', { name: 'Select blueprint category' }));
    fireEvent.click(screen.getByRole('option', { name: 'Metal' }));
    fireEvent.click(materialSelects()[0]);
    fireEvent.click(screen.getByRole('option', { name: 'None selected' }));
    fireEvent.click(screen.getAllByRole('button', { name: '-' })[1]);
    expect(screen.getByText('15', { selector: '.amount-value' })).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove material' })[0]);
    expect(materialSelects()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Remove material' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Craft Time (min)'), { target: { value: 'abc' } });
    expect(screen.getByLabelText('Craft Time (min)')).toHaveValue(1);
    fireEvent.change(screen.getByLabelText('Price (ZAR)'), { target: { value: '' } });
    expect(screen.getByLabelText('Price (ZAR)')).toHaveValue(0);

    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });
});
