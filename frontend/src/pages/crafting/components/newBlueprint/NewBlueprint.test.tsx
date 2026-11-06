import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewBlueprint from './newBlueprint';
import { showError, showSuccess } from '../../../../utils/toast';
import { httpError, mockedAxios, mockGet } from '../../../../test-utils/http';
import { branchesFixture } from '../../../../test-utils/fixtures';

jest.mock('../../../../utils/toast', () => ({ showError: jest.fn(), showSuccess: jest.fn(), showInfo: jest.fn() }));

// GET /Item/item/ as the live API sends it (camelCase).
const items = [
  { itemID: 1, itemName: 'Steel Sheet 2mm' },
  { itemID: 6, itemName: 'Hex Bolt M10' },
  { itemID: 0 },
];

function mockBackend(overrides: Record<string, unknown> = {}) {
  mockGet({ '/Item/item/': items, '/Branch': branchesFixture, ...overrides });
}

const nameInput = () => screen.getByLabelText('Blueprint Name');
const materialSelects = () => screen.getAllByRole('button', { name: 'Select material' });

function chooseMaterial(row: number, name: string) {
  fireEvent.click(materialSelects()[row]);
  fireEvent.click(screen.getByRole('option', { name }));
}

describe('NewBlueprint', () => {
  it('offers the backend’s items as materials', async () => {
    mockBackend();
    render(<NewBlueprint onCancel={jest.fn()} />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalledWith('/Item/item/'));
    fireEvent.click(materialSelects()[0]);

    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['None selected', 'Steel Sheet 2mm', 'Hex Bolt M10']);
  });

  it('starts every material row empty, so nothing stray is submitted', async () => {
    mockBackend();
    mockedAxios.post.mockResolvedValue({ data: { itemID: 50 } });
    render(<NewBlueprint onCancel={jest.fn()} />);
    fireEvent.change(nameInput(), { target: { value: 'Tool Rack' } });

    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint' }));

    expect(showError).toHaveBeenCalledWith('Please add a blueprint name and at least one material.');
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('creates the product, links existing and new materials, and adds empty stock at the first branch', async () => {
    mockBackend();
    mockedAxios.post
      .mockResolvedValueOnce({ data: { itemID: 50 } }) // the product
      .mockResolvedValueOnce({ data: {} }); // branch stock row
    mockedAxios.put.mockResolvedValue({ data: {} });
    const onCancel = jest.fn();
    render(<NewBlueprint onCancel={onCancel} />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());

    fireEvent.change(nameInput(), { target: { value: '  Tool Rack ' } });
    fireEvent.change(screen.getByLabelText('Craft Time (min)'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Price (ZAR)'), { target: { value: '1200' } });
    fireEvent.click(screen.getByRole('button', { name: 'Select blueprint category' }));
    fireEvent.click(screen.getByRole('option', { name: 'Furniture' }));
    chooseMaterial(0, 'Steel Sheet 2mm');
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '+' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: '-' })[0]);
    chooseMaterial(1, 'Hex Bolt M10');

    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint' }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalledWith('Blueprint created successfully. Returning to crafting page.'));
    expect(mockedAxios.post).toHaveBeenNthCalledWith(1, '/Item/item/', { itemName: 'Tool Rack', itemCategory: 'furniture', productionTime: 30, price: 1200 });
    expect(mockedAxios.put).toHaveBeenCalledWith('/Item/item/50/blueprint', {
      itemID: 50,
      productionTime: 30,
      price: 1200,
      ingredients: [
        { ingredientID: 1, ingredientQuantity: 2, productID: 50 },
        { ingredientID: 6, ingredientQuantity: 1, productID: 50 },
      ],
    });
    expect(mockedAxios.post).toHaveBeenNthCalledWith(2, '/Item/Branch', { branchID: 1, itemID: 50, itemQuantity: 0 });
    expect(onCancel).toHaveBeenCalled();
  });

  it('updates an existing item with the same name instead of creating a duplicate', async () => {
    mockBackend({ '/Branch': [] });
    mockedAxios.put.mockResolvedValue({ data: {} });
    render(<NewBlueprint onCancel={jest.fn()} />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());

    fireEvent.change(nameInput(), { target: { value: 'Hex Bolt M10' } });
    chooseMaterial(0, 'Steel Sheet 2mm');
    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint' }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    expect(mockedAxios.put).toHaveBeenCalledWith('/Item/6', { itemName: 'Hex Bolt M10', itemCategory: 'metal', productionTime: 1, price: 0 });
    expect(mockedAxios.post).not.toHaveBeenCalled();
  });

  it('creates materials that don’t exist yet and skips ones the server can’t create', async () => {
    mockGet({ '/Item/item/': [{ itemName: 'Rivet' }], '/Branch': httpError(500) });
    // Rivet is created once; the second row reuses its new id. Branch lookup fails, which is optional.
    mockedAxios.post
      .mockResolvedValueOnce({ data: { itemID: 50 } }) // product
      .mockResolvedValueOnce({ data: { itemID: 60 } }); // Rivet
    mockedAxios.put.mockResolvedValue({ data: {} });
    render(<NewBlueprint onCancel={jest.fn()} />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());

    fireEvent.change(nameInput(), { target: { value: 'Clamp' } });
    chooseMaterial(0, 'Rivet');
    chooseMaterial(1, 'Rivet');
    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint' }));

    await waitFor(() => expect(showSuccess).toHaveBeenCalled());
    expect(mockedAxios.post).toHaveBeenCalledWith('/Item/item/', { itemName: 'Rivet', itemCategory: 'other', productionTime: 1 });
    expect(mockedAxios.put).toHaveBeenCalledWith('/Item/item/50/blueprint', expect.objectContaining({
      ingredients: [
        { ingredientID: 60, ingredientQuantity: 1, productID: 50 },
        { ingredientID: 60, ingredientQuantity: 1, productID: 50 },
      ],
    }));
  });

  it('leaves out a material the server returned no id for', async () => {
    mockGet({ '/Item/item/': [{ itemName: 'Mystery' }], '/Branch': [] });
    mockedAxios.post.mockResolvedValueOnce({ data: { itemID: 50 } }).mockResolvedValueOnce({ data: null });
    mockedAxios.put.mockResolvedValue({ data: {} });
    render(<NewBlueprint onCancel={jest.fn()} />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());

    fireEvent.change(nameInput(), { target: { value: 'Clamp' } });
    chooseMaterial(0, 'Mystery');
    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint' }));

    await waitFor(() => expect(mockedAxios.put).toHaveBeenCalledWith('/Item/item/50/blueprint', expect.objectContaining({ ingredients: [] })));
  });

  it('reports a failure when the product can’t be created', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend();
    mockedAxios.post.mockResolvedValueOnce({ data: {} });
    render(<NewBlueprint onCancel={jest.fn()} />);
    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());
    fireEvent.change(nameInput(), { target: { value: 'Tool Rack' } });
    chooseMaterial(0, 'Steel Sheet 2mm');

    fireEvent.click(screen.getByRole('button', { name: 'Add Blueprint' }));

    await waitFor(() => expect(showError).toHaveBeenCalledWith('Unable to save blueprint. Please fix the issue and try again.'));
    expect(screen.getByRole('button', { name: 'Add Blueprint' })).toBeEnabled();
  });

  it('adds and removes material rows, keeps amounts at least 1 and craft time at least 1', () => {
    mockBackend();
    render(<NewBlueprint onCancel={jest.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add material to blueprint' }));
    expect(materialSelects()).toHaveLength(4);
    screen.getAllByRole('button', { name: 'Remove material' }).slice(0, 3).forEach((b) => fireEvent.click(b));
    expect(materialSelects()).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Remove material' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '-' }));
    expect(screen.getByText('1', { selector: '.amount-value' })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Craft Time (min)'), { target: { value: '0' } });
    expect(screen.getByLabelText('Craft Time (min)')).toHaveValue(1);
    fireEvent.change(screen.getByLabelText('Price (ZAR)'), { target: { value: '' } });
    expect(screen.getByLabelText('Price (ZAR)')).toHaveValue(0);
  });

  it('logs when the item list can’t load, and cancels on request', async () => {
    const error = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGet({ '/Item/item/': httpError(500) });
    const onCancel = jest.fn();
    render(<NewBlueprint onCancel={onCancel} />);

    await waitFor(() => expect(error).toHaveBeenCalledWith('Failed to load item options:', expect.anything()));
    expect(screen.getByRole('button', { name: 'Add Blueprint' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalled();
  });

  it('copes with an empty item list response', async () => {
    mockGet({ '/Item/item/': null });
    render(<NewBlueprint onCancel={jest.fn()} />);

    await waitFor(() => expect(mockedAxios.get).toHaveBeenCalled());
    fireEvent.click(materialSelects()[0]);
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['None selected']);
  });
});
