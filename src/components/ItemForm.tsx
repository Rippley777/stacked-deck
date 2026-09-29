import { useRef, useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import type { InventoryItem, Location } from '../../shared/types';
import { readItemForm } from '../lib/item-input';
import type { Valuation } from '../../shared/valuation';
import { ValuationSummary } from './Valuation';
import { ItemFields } from './ItemFields';
import { AdditionalComponents, type ComponentDraft } from './AdditionalComponents';
import { api, useResource } from '../api';
import { useApp } from '../context';
import { Modal, ErrorState, Loading } from './ui';
import { HardwareScanner } from './HardwareScanner';
import type { HardwareSuggestion } from '../../shared/hardware-scan';

function suggestedDetails(suggestion: HardwareSuggestion) {
  const { name, category, manufacturer, model, serialNumber, quantity, notes } = suggestion;
  return { name, category, manufacturer, model, serialNumber, quantity, notes };
}
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
  const [valuation, setValuation] = useState<Valuation | null>(null);
  const [valuing, setValuing] = useState(false);
  const valuationLock = useRef(false);
  async function estimateDraft() {
    if (valuationLock.current || !formRef.current) return;
    valuationLock.current = true;
    setValuing(true);
    setError('');
    try {
      const input = readItemForm(new FormData(formRef.current), '', isSystem);
      const result = await api<{ valuation: Valuation | null; message: string }>(
        '/hardware/valuation',
        { method: 'POST', body: JSON.stringify(input) },
      );
      setValuation(result.valuation);
      if (!result.valuation) setError(result.message);
    } catch (e) {
      setError((e as Error).message + ' You can still save hardware without an AI value.');
    } finally {
      valuationLock.current = false;
      setValuing(false);
    }
  }
  const formRef = useRef<HTMLFormElement>(null);
  const [components, setComponents] = useState<ComponentDraft[]>(() => [
    { id: crypto.randomUUID(), active: false },
  ]);
  function useSuggestion(suggestion: HardwareSuggestion) {
    setValuation(suggestion.valuation ?? null);
    // These are uncontrolled inputs. Update only the reviewed identification fields;
    // keep prices, location, condition, computer specs and other manual details.
    for (const [name, value] of Object.entries(suggestedDetails(suggestion))) {
      const field = formRef.current?.elements.namedItem(name);
      if (
        (field instanceof HTMLInputElement ||
          field instanceof HTMLSelectElement ||
          field instanceof HTMLTextAreaElement) &&
        value !== ''
      ) {
        field.value =
          name === 'notes'
            ? [field.value, value].filter(Boolean).join('\n')
            : name === 'quantity' && isSystem
              ? '1'
              : String(value);
      }
    }
    notify('Suggested details added. Review the form before saving.');
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (busy || valuing) return;
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
        const input = readItemForm(form, key, systemEntry);
        const initialValuation = key
          ? components.find((c) => `${c.id}-` === key)?.initialValuation
          : valuation;
        return {
          key,
          input: { ...input, ...(!item && initialValuation ? { initialValuation } : {}) },
        };
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
        if (!busy && !valuing) onClose();
      }}
      wide
    >
      {meta.loading ? (
        <Loading />
      ) : meta.error ? (
        <ErrorState message={meta.error} retry={meta.reload} />
      ) : (
        <form ref={formRef} onSubmit={submit}>
          <fieldset className="item-form-fields" disabled={busy || valuing}>
            <div className="form-body">
              <p className="form-intro">
                {isSystem
                  ? 'Catalog a computer you own, whether it came prebuilt or you assembled it yourself.'
                  : 'Give your hardware a home. You can fill in the finer details later.'}
              </p>
              {!item && (
                <HardwareScanner
                  isSystem={isSystem}
                  onUse={useSuggestion}
                  onAddComponent={(suggestion) => {
                    setComponents((rows) => [
                      ...rows.filter((row) => row.active),
                      {
                        id: crypto.randomUUID(),
                        active: true,
                        initialValues: suggestedDetails(suggestion),
                        initialValuation: suggestion.valuation ?? null,
                      },
                      ...rows.filter((row) => !row.active),
                    ]);
                    notify('Component added to the form. Review it before saving.');
                  }}
                />
              )}
              <ItemFields item={item} isSystem={isSystem} meta={meta.data!} autoFocus />
              {!item && (
                <section className="valuation-review" aria-label="Initial valuation">
                  <h3>Initial market estimate</h3>
                  <p className="muted small-text">
                    Optional. Confirm the model, condition and specifications first. This sends
                    hardware details to OpenAI. A value entered in the form takes priority over the
                    AI estimate.
                  </p>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={busy || valuing}
                    onClick={estimateDraft}
                  >
                    {valuing ? 'Estimating…' : 'Estimate value'}
                  </button>
                  {valuing && <p role="status">Generating a conservative estimate…</p>}
                  {valuation && (
                    <>
                      <ValuationSummary value={valuation} />
                      <p className="small-text">
                        This estimate will be saved with your hardware. Review it and the details
                        above.
                      </p>
                      <button
                        type="button"
                        className="button ghost"
                        onClick={() => setValuation(null)}
                      >
                        Discard AI estimate
                      </button>
                    </>
                  )}
                </section>
              )}
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
            <button
              type="button"
              className="button secondary"
              disabled={busy || valuing}
              onClick={onClose}
            >
              Cancel
            </button>
            <button className="button primary" disabled={busy || valuing}>
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
