import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import BlueprintPanel from './blueprintPanel';
import { httpError, mockedAxios, mockGet } from '../../../../test-utils/http';
import { adminUser, itemsFixture, signIn } from '../../../../test-utils/fixtures';

// GET /Item/item/allItemBlueprints: products with their ingredients.
const blueprints = [
  { itemID: 30, itemName: 'Steel Workbench 1800mm', itemCategory: 'Furniture', productionTime: 45, ingredients: [{ ingredientID: 1, quantity: 2 }, { ingredientID: 6, quantity: 16 }] },
  { ItemID: 20, itemName: 'Emergency Stop Button', productionTime: 2, Ingredients: [{ IngredientID: 6, Quantity: 4 }] },
  { itemID: 40, itemName: 'Gear Housing', itemCategory: 'Mechanical parts', productionTime: 30, ingredients: [] },
  { itemID: 41, itemName: 'Aluminium Frame', itemCategory: 'Metals', productionTime: 20 },
  { itemID: 42, itemName: 'Wiring Loom', itemCategory: 'Electronics', productionTime: 15, ingredients: [{ itemName: 'Loose wire', quantity: 1 }] },
];

const branchStock = [
  { ItemID: 1, ItemQuantity: 140 },
  { itemID: 6, itemQuantity: 40 },
  { itemId: 30, ItemQuantity: 14 },
  { ItemQuantity: 99 },
];

function mockBackend(overrides: Record<string, unknown> = {}) {
  mockGet({
    '/Item/item/allItemBlueprints': blueprints,
    '/Item/Branch/1': branchStock,
    '/Item/item': [...itemsFixture, { itemId: 99 }, {}],
    ...overrides,
  });
}

const card = (name: string) => screen.getByRole('heading', { name }).closest('button') as HTMLElement;

function setup(props: Partial<React.ComponentProps<typeof BlueprintPanel>> = {}) {
  const handlers = { onFilterChange: jest.fn(), onSelectBlueprint: jest.fn(), onCreateBlueprint: jest.fn() };
  const utils = render(<BlueprintPanel selectedBlueprintId="bp-30" filter="all" {...handlers} {...props} />);
  return { ...handlers, ...utils };
}

describe('BlueprintPanel', () => {
  beforeEach(() => signIn());

  it('shows each blueprint with branch stock and how many can be crafted from the materials on hand', async () => {
    mockBackend();
    setup();

    const workbench = await waitFor(() => card('Steel Workbench 1800mm'));
    // Have 14 workbenches; materials allow min(140/2, 40/16) = 2 more.
    expect(within(workbench).getByText('Have').nextSibling).toHaveTextContent('14');
    expect(within(workbench).getByText('Craft').nextSibling).toHaveTextContent('2');
    expect(workbench).toHaveClass('active');

    const button = card('Emergency Stop Button');
    expect(within(button).getByText('Craft').nextSibling).toHaveTextContent('10');
    expect(card('Gear Housing')).toHaveClass('cant-craft');
    expect(card('Wiring Loom')).toHaveClass('cant-craft');
    expect(screen.queryByText('Loading blueprints...')).not.toBeInTheDocument();
  });

  it('auto-selects the first blueprint when none is selected', async () => {
    mockBackend();
    const { onSelectBlueprint } = setup({ selectedBlueprintId: '' });

    await waitFor(() => expect(onSelectBlueprint).toHaveBeenCalledWith('bp-30'));
  });

  it('selects a blueprint on click', async () => {
    mockBackend();
    const { onSelectBlueprint } = setup();

    fireEvent.click(await waitFor(() => card('Emergency Stop Button')));

    expect(onSelectBlueprint).toHaveBeenCalledWith('bp-20');
  });

  it('filters by normalised category', async () => {
    mockBackend();
    const { rerender, onFilterChange, onSelectBlueprint, onCreateBlueprint } = setup();
    await waitFor(() => card('Steel Workbench 1800mm'));

    const show = (filter: string) => {
      rerender(<BlueprintPanel selectedBlueprintId="bp-30" filter={filter} onFilterChange={onFilterChange} onSelectBlueprint={onSelectBlueprint} onCreateBlueprint={onCreateBlueprint} />);
      return screen.queryAllByRole('heading', { level: 4 }).map((h) => h.textContent);
    };

    expect(show('furniture')).toEqual(['Steel Workbench 1800mm']);
    expect(show('mechanical')).toEqual(['Gear Housing']);
    expect(show('metal')).toEqual(['Aluminium Frame']);
    expect(show('electronics')).toEqual(['Emergency Stop Button', 'Wiring Loom']);
    expect(show('paper')).toEqual([]);
  });

  it('passes filter changes up and opens the new-blueprint form', async () => {
    mockBackend();
    const { onFilterChange, onCreateBlueprint } = setup();

    fireEvent.click(screen.getByRole('button', { name: 'Blueprint filter' }));
    fireEvent.click(screen.getByRole('option', { name: 'Furniture' }));
    fireEvent.click(screen.getByRole('button', { name: 'New Blueprint' }));

    expect(onFilterChange).toHaveBeenCalledWith('furniture');
    expect(onCreateBlueprint).toHaveBeenCalled();
    await waitFor(() => card('Steel Workbench 1800mm'));
  });

  it('uses all-branch stock when the user has no branch', async () => {
    signIn({ ...adminUser, branchId: undefined });
    mockBackend({ '/Item/Branch': branchStock });
    setup();

    await waitFor(() => card('Steel Workbench 1800mm'));
    expect(mockedAxios.get).toHaveBeenCalledWith('/Item/Branch');
  });

  it('shows the error when blueprints can’t be loaded', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockBackend({ '/Item/item/allItemBlueprints': httpError(500) });
    setup();

    expect(await screen.findByText(/^Error: /)).toBeInTheDocument();
  });

  it('shows a generic error for non-Error failures', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    mockedAxios.get.mockRejectedValue('offline');
    setup();

    expect(await screen.findByText('Error: Unknown error occurred')).toBeInTheDocument();
  });

  it('reloads when the refresh key changes', async () => {
    mockBackend();
    const { rerender, onFilterChange, onSelectBlueprint, onCreateBlueprint } = setup({ refreshKey: 0 });
    await waitFor(() => card('Steel Workbench 1800mm'));
    const before = mockedAxios.get.mock.calls.length;

    rerender(<BlueprintPanel selectedBlueprintId="bp-30" filter="all" refreshKey={1} onFilterChange={onFilterChange} onSelectBlueprint={onSelectBlueprint} onCreateBlueprint={onCreateBlueprint} />);

    await waitFor(() => expect(mockedAxios.get.mock.calls.length).toBe(before + 3));
  });
});
