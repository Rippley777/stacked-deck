import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import type { InventoryItem, Location } from '../../shared/types';
import { itemSchema } from '../../shared/validation';
import { ItemFields } from './ItemFields';
import { AdditionalComponents, type ComponentDraft } from './AdditionalComponents';
import { api, useResource } from '../api';
import { useApp } from '../context';
import { Modal, ErrorState, Loading } from './ui';
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
  const [components, setComponents] = useState<ComponentDraft[]>(() => [
    { id: crypto.randomUUID(), active: false },
  ]);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const entries = [
        { key: '', systemEntry: isSystem },
        ...(!item && isSystem
          ? components
              .filter((component) => component.active)
              .map((component) => ({ key: `${component.id}-`, systemEntry: false }))
          : []),
      ];
      const inputs = entries.map(({ key, systemEntry }) => {
        const str = (name: string) => String(form.get(`${key}${name}`) || '');
        const cents = (name: string) =>
          str(name) === '' ? null : Math.round(Number(str(name)) * 100);
        const parsed = itemSchema.safeParse({
          kind: systemEntry ? 'System' : 'Component',
          systemSpecs: systemEntry
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
        });
        if (!parsed.success)
          throw new Error(
            `${str('name') || 'Hardware'}: ${parsed.error.issues[0].path.join(' ')} — ${parsed.error.issues[0].message}`,
          );
        return { key, input: parsed.data };
      });
      const withComponents = !item && isSystem && inputs.length > 1;
      const saved = await api<InventoryItem>(
        withComponents ? '/inventory/systems' : `/inventory${item ? `/${item.id}` : ''}`,
        {
          method: item ? 'PUT' : 'POST',
          body: JSON.stringify(
            withComponents
              ? { system: inputs[0].input, components: inputs.slice(1).map(({ input }) => input) }
              : inputs[0].input,
          ),
        },
      );
      refresh();
      notify(
        item
          ? 'Hardware updated.'
          : isSystem
            ? 'Computer added to your collection.'
            : 'A new card in your deck.',
      );
      onClose();
      if (saved) onSaved?.(saved);
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
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      {meta.loading ? (
        <Loading />
      ) : meta.error ? (
        <ErrorState message={meta.error} retry={meta.reload} />
      ) : (
        <form onSubmit={submit}>
          <fieldset className="item-form-fields" disabled={busy}>
            <div className="form-body">
              <p className="form-intro">
                {isSystem
                  ? 'Catalog a computer you own, whether it came prebuilt or you assembled it yourself.'
                  : 'Give your hardware a home. You can fill in the finer details later.'}
              </p>
              <ItemFields item={item} isSystem={isSystem} meta={meta.data!} autoFocus />
              {!item && isSystem && (
                <AdditionalComponents
                  components={components}
                  setComponents={setComponents}
                  meta={meta.data!}
                  busy={busy}
                />
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </div>
          </fieldset>
          <div className="modal-footer">
            <button type="button" className="button secondary" disabled={busy} onClick={onClose}>
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
