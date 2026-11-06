import React, { useEffect, useState } from 'react';
import FilterSelect from '../../../components/common/FilterSelect';
import { InventoryItem, InventoryItemUpdate } from '../../../services/inventoryApi';

type InventoryItemEditModalProps = {
  item: InventoryItem | null;
  open: boolean;
  saving: boolean;
  categoryOptions: string[];
  onClose: () => void;
  onSave: (itemId: number, payload: InventoryItemUpdate) => Promise<void>;
};

function InventoryItemEditModal({ item, open, saving, categoryOptions, onClose, onSave }: InventoryItemEditModalProps) {
  const [formValues, setFormValues] = useState<InventoryItemUpdate>({
    itemName: '',
    itemCategory: '',
    productionTime: 0,
    price: null,
    quantity: 0,
    branchId: -1
  });

  useEffect(() => {
    if (item) {
      setFormValues({
        itemName: item.name,
        itemCategory: item.category.trim(),
        productionTime: item.productionTime,
        price: item.price,
        quantity: item.quantity,
        branchId: item.branchId
      });
    }
  }, [item]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  if (!open || !item) {
    return null;
  }

  const categoryValue = formValues.itemCategory.trim();
  const categoryIsKnown = categoryValue.length > 0 && categoryOptions.includes(categoryValue);
  const selectOptions = categoryIsKnown ? categoryOptions : [categoryValue, ...categoryOptions.filter((option) => option !== categoryValue)].filter((option) => option.length > 0);
  const categorySelectOptions = selectOptions.map((option) => ({ value: option, label: option }));

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onSave(Number(item.id), formValues);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      style={{ backgroundColor: 'var(--overlay-backdrop)' }}
      role="presentation"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-border bg-surface shadow-[0_30px_80px_rgba(15,23,42,0.28)]"
        role="dialog"
        aria-modal="true"
        aria-label={`Edit ${item.name}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 rounded-t-2xl border-b border-border bg-app px-5 py-2 text-xs text-muted">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
            <circle cx="12" cy="9.5" r="2.5" />
          </svg>
          <span className="font-semibold uppercase tracking-[0.16em]">Branch</span>
          <span className="truncate font-semibold text-text" data-testid="edit-item-branch">{item.location}</span>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Edit item</p>
              <h3 className="mt-1 text-lg font-semibold text-text">{item.name}</h3>
              <p className="mt-1 text-xs text-muted">Update the core item details used throughout the inventory views.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg border border-border bg-app px-3 py-2 text-sm font-medium text-text transition hover:border-primary">
              Close
            </button>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-text">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Item name</span>
              <input
                value={formValues.itemName}
                onChange={(event) => setFormValues((current) => ({ ...current, itemName: event.target.value }))}
                className="w-full rounded-xl border border-border bg-app px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary"
                required
              />
            </label>

            <label className="space-y-2 text-sm text-text">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Category</span>
              <FilterSelect
                value={formValues.itemCategory}
                onChange={(value) => setFormValues((current) => ({ ...current, itemCategory: value }))}
                options={categorySelectOptions}
                ariaLabel="Select item category"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-text">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Production time</span>
              <input
                type="number"
                min={0}
                value={formValues.productionTime}
                onChange={(event) => setFormValues((current) => ({ ...current, productionTime: Number(event.target.value) }))}
                className="w-full rounded-xl border border-border bg-app px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary"
                required
              />
            </label>

            <label className="space-y-2 text-sm text-text">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Price (ZAR)</span>
              <input
                type="number"
                min={0}
                step="0.01"
                value={formValues.price ?? ''}
                onChange={(event) => {
                  const nextValue = event.target.value;
                  setFormValues((current) => ({
                    ...current,
                    price: nextValue === '' ? null : Number(nextValue),
                  }));
                }}
                className="w-full rounded-xl border border-border bg-app px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-2 text-sm text-text">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted">Total quantity</span>
              <input
                type="number"
                min={0}
                value={formValues.quantity}
                onChange={(event) => setFormValues((current) => ({ ...current, quantity: Number(event.target.value) }))}
                className="w-full rounded-xl border border-border bg-app px-3 py-2.5 text-sm text-text outline-none transition focus:border-primary"
                required
              />
            </label>

            <div className="rounded-xl border border-border bg-bg px-3 py-2.5 text-sm text-muted">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">Inventory summary</p>
              <p className="mt-1">Name, category, production time and price apply to every branch.</p>
              <p className="mt-1">Quantity only changes this branch's stock.</p>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
            <button type="button" onClick={onClose} className="rounded-lg border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:border-primary">
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-primary px-4 py-2 text-sm font-medium transition hover:bg-primaryDark disabled:cursor-not-allowed disabled:opacity-60"
              style={{ color: 'var(--on-primary)' }}
            >
              {saving ? 'Saving...' : 'Save changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default InventoryItemEditModal;
