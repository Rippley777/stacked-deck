import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import type { InventoryItem, Location } from '../../shared/types';
import { buildTypes, conditions, itemStatuses, systemCategories } from '../../shared/types';
import { api, useResource } from '../api';
import { useApp } from '../context';
import { Modal, Field, ErrorState, Loading } from './ui';
export function ItemForm({
  item,
  onClose,
  system = false,
  onSaved,
}: {
  item?: InventoryItem;
  onClose: () => void;
  system?: boolean;
  onSaved?: (item: InventoryItem) => void;
}) {
  const isSystem = item ? item.kind === 'System' : system;
  const { refresh, notify } = useApp();
  const meta = useResource<{ categories: string[]; locations: Location[] }>('/meta');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const str = (key: string) => String(form.get(key) || '');
    const cents = (key: string) => (str(key) === '' ? null : Math.round(Number(str(key)) * 100));
    setBusy(true);
    setError('');
    try {
      const saved = await api<InventoryItem>(`/inventory${item ? `/${item.id}` : ''}`, {
        method: item ? 'PUT' : 'POST',
        body: JSON.stringify({
          kind: isSystem ? 'System' : 'Component',
          systemSpecs: isSystem
            ? {
                buildType: str('buildType'),
                processor: str('processor'),
                graphics: str('graphics'),
                memoryGB: str('memoryGB') ? Number(str('memoryGB')) : null,
                storage: str('storage'),
                motherboard: str('motherboard'),
                powerSupply: str('powerSupply'),
                operatingSystem: str('operatingSystem'),
              }
            : null,
          name: str('name'),
          manufacturer: str('manufacturer'),
          model: str('model'),
          category: str('category'),
          quantity: Number(str('quantity')),
          condition: str('condition'),
          status: str('status'),
          locationId: str('locationId') || null,
          tags: str('tags')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
          notes: str('notes'),
          serialNumber: str('serialNumber'),
          purchaseDate: str('purchaseDate') || null,
          purchasePriceCents: cents('purchasePrice'),
          estimatedValueCents: cents('estimatedValue'),
          imageUrl: str('imageUrl'),
        }),
      });
      refresh();
      notify(
        item
          ? 'Hardware updated.'
          : isSystem
            ? 'Computer added to your collection.'
            : 'A new card in your deck.',
      );
      onClose();
      onSaved?.(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={
        isSystem
          ? item
            ? 'Edit computer'
            : 'Add a complete computer'
          : item
            ? 'Edit hardware'
            : 'Add to your deck'
      }
      onClose={onClose}
      wide
    >
      {meta.loading ? (
        <Loading />
      ) : meta.error ? (
        <ErrorState message={meta.error} retry={meta.reload} />
      ) : (
        <form onSubmit={submit}>
          <div className="form-body">
            <p className="form-intro">
              {isSystem
                ? 'Catalog a computer you own, whether it came prebuilt or you assembled it yourself. Link individual inventory parts after saving.'
                : 'Give your hardware a home. You can fill in the finer details later.'}
            </p>
            <div className="form-grid">
              <Field label="Name *" className="full">
                <input
                  name="name"
                  required
                  maxLength={160}
                  defaultValue={item?.name}
                  placeholder={
                    isSystem ? 'e.g. Living room gaming PC' : 'e.g. Raspberry Pi 4 · 8GB'
                  }
                  autoFocus
                />
              </Field>
              {isSystem ? (
                <>
                  <Field label="Computer type *">
                    <select name="category" defaultValue={item?.category || 'Desktop Computer'}>
                      {systemCategories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Build origin">
                    <select
                      name="buildType"
                      defaultValue={item?.systemSpecs?.buildType || 'Prebuilt'}
                    >
                      {buildTypes.map((t) => (
                        <option key={t}>{t}</option>
                      ))}
                    </select>
                  </Field>
                  <input name="quantity" type="hidden" value="1" />
                </>
              ) : (
                <>
                  <Field label="Category *" hint="Choose a category or type your own.">
                    <input
                      name="category"
                      required
                      list="categories"
                      defaultValue={item?.category || 'Raspberry Pi'}
                      maxLength={160}
                    />
                    <datalist id="categories">
                      {meta.data?.categories.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Quantity *">
                    <input
                      name="quantity"
                      type="number"
                      min="1"
                      max="100000"
                      required
                      defaultValue={item?.quantity || 1}
                    />
                  </Field>
                </>
              )}
              <Field label="Manufacturer">
                <input
                  name="manufacturer"
                  defaultValue={item?.manufacturer}
                  maxLength={160}
                  placeholder="e.g. NVIDIA"
                />
              </Field>
              <Field label="Model">
                <input
                  name="model"
                  defaultValue={item?.model}
                  maxLength={160}
                  placeholder="e.g. RTX 3070 Ti"
                />
              </Field>
              <Field label="Condition">
                <select name="condition" defaultValue={item?.condition || 'Good'}>
                  {conditions.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field
                label="Base status"
                hint={
                  item?.assignments.length
                    ? 'Assignments control reserved and in-use units.'
                    : undefined
                }
              >
                <select
                  name="status"
                  defaultValue={item?.status || (isSystem ? 'In Use' : 'Available')}
                >
                  {itemStatuses.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </select>
              </Field>
              <Field label="Location">
                <select name="locationId" defaultValue={item?.locationId || ''}>
                  <option value="">No location yet</option>
                  {meta.data?.locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Tags" hint="Separate tags with commas.">
                <input
                  name="tags"
                  defaultValue={item?.tags.join(', ')}
                  placeholder="homelab, arm64, spare"
                />
              </Field>
              <Field
                label={isSystem ? 'Current value of computer ($)' : 'Current value per unit ($)'}
                hint={
                  isSystem
                    ? 'Includes linked parts. Leave blank to use their combined value.'
                    : undefined
                }
              >
                <input
                  name="estimatedValue"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={
                    item?.estimatedValueCents != null ? item.estimatedValueCents / 100 : ''
                  }
                />
              </Field>
              <Field
                label={isSystem ? 'Purchase price of computer ($)' : 'Purchase price per unit ($)'}
              >
                <input
                  name="purchasePrice"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={
                    item?.purchasePriceCents != null ? item.purchasePriceCents / 100 : ''
                  }
                />
              </Field>
              <Field label="Purchase date">
                <input name="purchaseDate" type="date" defaultValue={item?.purchaseDate || ''} />
              </Field>
              <Field label="Serial number">
                <input name="serialNumber" defaultValue={item?.serialNumber} maxLength={160} />
              </Field>
              <Field label="Photo URL" className="full">
                <input
                  name="imageUrl"
                  type="url"
                  defaultValue={item?.imageUrl}
                  placeholder="https://…"
                />
              </Field>
              {isSystem && (
                <>
                  <div className="full system-form-heading">
                    <h3>Computer specifications</h3>
                    <p className="muted small-text">
                      Add what you know. Specifications describe this computer; individual parts can
                      also be linked from your deck.
                    </p>
                  </div>
                  <Field label="Processor">
                    <input
                      name="processor"
                      maxLength={160}
                      defaultValue={item?.systemSpecs?.processor}
                      placeholder="e.g. AMD Ryzen 7 7800X3D"
                    />
                  </Field>
                  <Field label="Graphics">
                    <input
                      name="graphics"
                      maxLength={160}
                      defaultValue={item?.systemSpecs?.graphics}
                      placeholder="e.g. NVIDIA RTX 4070 / integrated"
                    />
                  </Field>
                  <Field label="Memory (GB)">
                    <input
                      name="memoryGB"
                      type="number"
                      min="0.5"
                      max="16384"
                      step="0.5"
                      defaultValue={item?.systemSpecs?.memoryGB ?? ''}
                      placeholder="32"
                    />
                  </Field>
                  <Field label="Storage">
                    <input
                      name="storage"
                      maxLength={500}
                      defaultValue={item?.systemSpecs?.storage}
                      placeholder="e.g. 1 TB NVMe SSD + 4 TB HDD"
                    />
                  </Field>
                  <Field label="Motherboard">
                    <input
                      name="motherboard"
                      maxLength={160}
                      defaultValue={item?.systemSpecs?.motherboard}
                      placeholder="e.g. ASUS B650"
                    />
                  </Field>
                  <Field label="Power supply">
                    <input
                      name="powerSupply"
                      maxLength={160}
                      defaultValue={item?.systemSpecs?.powerSupply}
                      placeholder="e.g. Corsair RM750x · 750 W"
                    />
                  </Field>
                  <Field label="Operating system" className="full">
                    <input
                      name="operatingSystem"
                      maxLength={160}
                      defaultValue={item?.systemSpecs?.operatingSystem}
                      placeholder="e.g. Windows 11 / Ubuntu 24.04"
                    />
                  </Field>
                </>
              )}
              <Field label="Notes" className="full">
                <textarea
                  name="notes"
                  rows={3}
                  defaultValue={item?.notes}
                  maxLength={10000}
                  placeholder="Specifications, quirks, ideas for a future build…"
                />
              </Field>
            </div>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button type="button" className="button secondary" onClick={onClose}>
              Cancel
            </button>
            <button className="button primary" disabled={busy}>
              <Save size={16} />
              {busy
                ? 'Saving…'
                : item
                  ? 'Save changes'
                  : isSystem
                    ? 'Add computer'
                    : 'Add hardware'}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
