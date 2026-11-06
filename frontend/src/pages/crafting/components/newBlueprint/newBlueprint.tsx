import React, { FC, useEffect, useState } from 'react';
import Button from '../../../../components/common/Button';
import FilterSelect from '../../../../components/common/FilterSelect';
import { useApi, useThemeAwareIcon } from '../../../../hooks';
import { showError, showSuccess } from '../../../../utils/toast';
import './newBlueprint.css';
import unitIcon from '../../../../assets/images/uniitIcon.png';
import unitIconWhite from '../../../../assets/images/uniitIconWhite.png';

interface MaterialRow {
  id: string;
  item: string;
  amount: number;
}

interface NewBlueprintProps {
  onCancel: () => void;
}

interface ItemOption {
  value: string;
  label: string;
}

const categoryOptions = [
  { value: 'metal', label: 'Metal' },
  { value: 'mechanical', label: 'Mechanical' },
  { value: 'electronics', label: 'Electronics' },
  { value: 'furniture', label: 'Furniture' },
  { value: 'paper', label: 'Paper' },
  { value: 'plastic', label: 'Plastic' },
  { value: 'other', label: 'Other' },
];

const NewBlueprint: FC<NewBlueprintProps> = ({ onCancel }) => {
  const api = useApi();
  const [blueprintName, setBlueprintName] = useState('');
  const [category, setCategory] = useState('metal');
  const [craftTimeMinutes, setCraftTimeMinutes] = useState(1);
  const [price, setPrice] = useState<number>(0);
  const [materials, setMaterials] = useState<MaterialRow[]>([
    // All rows start empty: a preset value that isn't in the item list would be shown as
    // "None selected" yet still be submitted, creating a stray item.
    { id: 'mat-1', item: '', amount: 1 },
    { id: 'mat-2', item: '', amount: 1 },
    { id: 'mat-3', item: '', amount: 1 },
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [itemOptions, setItemOptions] = useState<ItemOption[]>([]);

  useEffect(() => {
    const fetchItems = async () => {
      try {
        const response = await api.get('/Item/item/');
        const items = response.data || [];
        const options = items
          .filter((item: any) => item?.itemName)
          .map((item: any) => ({
            value: item.itemName,
            label: item.itemName,
          }));
        setItemOptions(options);
      } catch (error) {
        console.error('Failed to load item options:', error);
      }
    };

    fetchItems();
  }, [api]);

  const handleMaterialChange = (id: string, field: 'item' | 'amount', value: string | number) => {
    setMaterials((current) =>
      current.map((material) =>
        material.id === id
          ? {
              ...material,
              [field]: field === 'amount' ? Number(value) : String(value),
            }
          : material
      )
    );
  };

  const unitIconSrc = useThemeAwareIcon(unitIcon, unitIconWhite);

  const addMaterialRow = () => {
    setMaterials((current) => [
      ...current,
      { id: `mat-${current.length + 1}-${Date.now()}`, item: '', amount: 1 },
    ]);
  };

  const removeMaterialRow = (id: string) => {
    setMaterials((current) => current.filter((material) => material.id !== id));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validMaterials = materials.filter((material) => material.item.trim());
    if (!blueprintName.trim() || validMaterials.length === 0) {
      showError('Please add a blueprint name and at least one material.');
      return;
    }

    setIsSubmitting(true);

    try {
      const itemsResponse = await api.get('/Item/item/');
      const existingItems: any[] = itemsResponse.data || [];
      const nameToId = existingItems.reduce<Record<string, number>>((map, item) => {
        if (item?.itemName && item?.itemID) {
          map[item.itemName] = item.itemID;
        }
        return map;
      }, {});

      let itemId = nameToId[blueprintName.trim()];
      if (!itemId) {
        const itemPayload = {
          itemName: blueprintName.trim(),
          itemCategory: category,
          productionTime: craftTimeMinutes,
          price: Number(price) || 0,
        };

        const createdItemResponse = await api.post('/Item/item/', itemPayload);
        itemId = createdItemResponse.data?.itemID;
        if (!itemId) {
          throw new Error('Unable to create the item for this blueprint.');
        }
      } else {
        await api.put(`/Item/${itemId}`, {
          itemName: blueprintName.trim(),
          itemCategory: category,
          productionTime: craftTimeMinutes,
          price: Number(price) || 0,
        });
      }

      const ingredientPayloads = [];
      for (const material of validMaterials) {
        const materialName = material.item.trim();
        if (!materialName) {
          continue;
        }

        let ingredientId = nameToId[materialName];
        if (!ingredientId) {
          const createdIngredientResponse = await api.post('/Item/item/', {
            itemName: materialName,
            itemCategory: 'other',
            productionTime: 1,
          });
          ingredientId = createdIngredientResponse.data?.itemID;
          if (ingredientId) {
            nameToId[materialName] = ingredientId;
          }
        }

        if (ingredientId) {
          ingredientPayloads.push({
            ingredientID: ingredientId,
            ingredientQuantity: material.amount,
            productID: itemId,
          });
        }
      }

      const blueprintPayload = {
        itemID: itemId,
        productionTime: craftTimeMinutes,
        price: Number(price) || 0,
        ingredients: ingredientPayloads,
      };
      await api.put(`/Item/item/${itemId}/blueprint`, blueprintPayload);

      try {
        const branchesResponse = await api.get('/Branch');
        const branches: any[] = branchesResponse.data || [];
        if (branches.length > 0) {
          await api.post('/Item/Branch', {
            branchID: branches[0].branchID,
            itemID: itemId,
            itemQuantity: 0,
          });
        }
      } catch (branchError) {
        // optional inventory zero-quantity creation; ignore if branch data is unavailable
      }

      showSuccess('Blueprint created successfully. Returning to crafting page.');
      onCancel();
    } catch (error) {
      console.error('Error creating blueprint:', error);
      showError('Unable to save blueprint. Please fix the issue and try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasValidName = blueprintName.trim().length > 0;

  return (
    <div className="new-blueprint-panel">
      <div className="new-blueprint-header">
        <div className="new-blueprint-heading">
          <img src={unitIconSrc} alt="Blueprint icon" className="new-blueprint-icon" />
          <span className="new-blueprint-tag">New Blueprint</span>
        </div>
      </div>

      <form className="new-blueprint-form" onSubmit={handleSubmit}>
        <div className="field-row">
          <div className="field-group">
            <label htmlFor="blueprintName">Blueprint Name</label>
            <input
              id="blueprintName"
              type="text"
              value={blueprintName}
              onChange={(event) => setBlueprintName(event.target.value)}
              placeholder="Name"
              className="field-input"
            />
          </div>
        </div>

        <div className="field-row field-row--split">
          <div className="field-group field-group--craft-time">
            <label htmlFor="craftTimeMinutes">Craft Time (min)</label>
            <input
              id="craftTimeMinutes"
              type="number"
              min={1}
              step={1}
              value={craftTimeMinutes}
              onChange={(event) => setCraftTimeMinutes(Math.max(1, Number(event.target.value) || 1))}
              className="field-input craft-time-input"
            />
          </div>

          <div className="field-group field-group--category">
            <label htmlFor="blueprintCategory">Category of Blueprint</label>
            <FilterSelect
              value={category}
              onChange={setCategory}
              options={categoryOptions}
              className="field-select"
              ariaLabel="Select blueprint category"
            />
          </div>
          <div className="field-group field-group--price">
            <label htmlFor="blueprintPrice">Price (ZAR)</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input
                id="blueprintPrice"
                type="number"
                min={0}
                step={0.01}
                value={price}
                onChange={(e) => setPrice(Number(e.target.value || 0))}
                className="field-input"
                placeholder="0.00"
              />
            </div>
          </div>
        </div>
 <label htmlFor="blueprintCategory">Required materials</label>
        <div className="material-list">
          {materials.map((material) => (
            <div key={material.id} className="materials-row">
              <FilterSelect
                value={material.item}
                onChange={(value) => handleMaterialChange(material.id, 'item', value)}
                options={[
                  { value: '', label: 'None selected' },
                  ...itemOptions,
                ]}
                className="field-select material-select"
                ariaLabel="Select material"
              />

              <div className="amount-line">
                <span className="amount-caption">Amount Needed</span>
                <button
                  type="button"
                  className="amount-button"
                  onClick={() =>
                    handleMaterialChange(material.id, 'amount', Math.max(1, material.amount - 1))
                  }
                >
                  -
                </button>
                <span className="amount-value">{material.amount}</span>
                <button
                  type="button"
                  className="amount-button"
                  onClick={() => handleMaterialChange(material.id, 'amount', material.amount + 1)}
                >
                  +
                </button>
                
              </div>

              {materials.length > 1 && (
                <button
                  type="button"
                  className="remove-material"
                  onClick={() => removeMaterialRow(material.id)}
                  aria-label="Remove material"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        <button type="button" className="add-material-button" onClick={addMaterialRow}>
          + Add material to blueprint
        </button>

        <div className="new-blueprint-actions">
          <Button type="submit" disabled={!hasValidName || isSubmitting}>
            {isSubmitting ? 'Saving...' : 'Add Blueprint'}
          </Button>
          <Button variant="secondary" type="button" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
};

export default NewBlueprint;
