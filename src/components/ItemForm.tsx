import { DuplicateMatches, readDuplicateDraft } from './DuplicateMatches';
import type { DuplicateDraft } from '../../shared/duplicates';
import type { Connectivity } from '../../shared/connectivity';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
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
  return {
    name,
    category,
    manufacturer,
    model,
    serialNumber,
    quantity,
    notes,
    connectivity: suggestion.connectivity,
  };
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
  const canAddAnother = !item && !isSystem;
  // Only these defaults belong to the session; everything else belongs to one item.
  const [defaults, setDefaults] = useState<
    Pick<Partial<InventoryItem>, 'locationId' | 'condition' | 'status' | 'tags' | 'category'>
  >({});
  const [keepCategory, setKeepCategory] = useState(false);
  const [generation, setGeneration] = useState(0);
  const [scanning, setScanning] = useState(false);
  const saveLock = useRef(false);
  const rapidButton = useRef<HTMLButtonElement>(null);
  const startRef = useRef<HTMLParagraphElement>(null);
  const { refresh, notify } = useApp();
  const meta = useResource<{ categories: string[]; locations: Location[] }>('/meta');
  const [scanConnectivity, setScanConnectivity] = useState<Connectivity | null>();
  const [duplicateDraft, setDuplicateDraft] = useState<DuplicateDraft | null>(null);
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
  const updateDuplicateDraft = useCallback(() => {
    if (formRef.current && !item) setDuplicateDraft(readDuplicateDraft(formRef.current, isSystem));
  }, [item, isSystem]);
  useEffect(() => {
    if (!generation) return;
    const form = formRef.current;
    const name = form?.elements.namedItem('name');
    if (window.matchMedia('(pointer: coarse)').matches) {
      // Return to scanning/entry without opening a touch keyboard after every save.
      startRef.current?.focus({ preventScroll: true });
      form?.closest('dialog')?.scrollTo({ top: 0 });
    } else if (name instanceof HTMLInputElement) {
      name.focus({ preventScroll: true });
      name.scrollIntoView({ block: 'center' });
    }
  }, [generation]);
  const [components, setComponents] = useState<ComponentDraft[]>(() => [
    { id: crypto.randomUUID(), active: false },
  ]);
  function useSuggestion(suggestion: HardwareSuggestion) {
    setValuation(suggestion.valuation ?? null);
    if (suggestion.connectivity) setScanConnectivity(suggestion.connectivity);
    // These are uncontrolled inputs. Update only the reviewed identification fields;
    // keep prices, location, condition, computer specs and other manual details.
    for (const [name, value] of Object.entries(suggestedDetails(suggestion))) {
      if (name === 'connectivity') continue;
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
    if (formRef.current) setDuplicateDraft(readDuplicateDraft(formRef.current, isSystem));
    notify('Suggested details added. Review the form before saving.');
  }
  async function addQuantity(id: string, quantity: number) {
    if (saveLock.current || valuationLock.current || !formRef.current) return;
    // Read enabled fields before marking the fieldset busy.
    let draft;
    try {
      draft = readItemForm(new FormData(formRef.current), '', isSystem);
    } catch (e) {
      setError((e as Error).message);
      return;
    }
    saveLock.current = true;
    setBusy(true);
    setError('');
    try {
      const saved = await api<InventoryItem>(`/inventory/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ addQuantity: quantity, draft }),
      });
      refresh();
      notify(`Added ${quantity} to ${saved.name}. Quantity is now ${saved.quantity}.`);
      onClose();
      onSaved?.(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saveLock.current = false;
      setBusy(false);
    }
  }
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const another =
      canAddAnother && (e.nativeEvent as SubmitEvent).submitter === rapidButton.current;
    if (saveLock.current || valuationLock.current || (another && scanning)) return;
    saveLock.current = true;
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
        another
          ? `Item ${generation + 1} added. Ready for the next.`
          : item
            ? 'Hardware updated.'
            : isSystem
              ? 'Computer added to your collection.'
              : 'A new card in your deck.',
      );
      if (another) {
        const { locationId, condition, status, tags, category } = inputs[0].input;
        setDefaults({ locationId, condition, status, tags, ...(keepCategory ? { category } : {}) });
        setDuplicateDraft(null);
        setScanConnectivity(undefined);
        setValuation(null);
        setScanning(false);
        setComponents([{ id: crypto.randomUUID(), active: false }]);
        // Remount uncontrolled fields and scanner, whose cleanup aborts any scan.
        setGeneration((value) => value + 1);
      } else {
        onClose();
      }
      if (saved) onSaved?.(saved);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saveLock.current = false;
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
        <form
          ref={formRef}
          onSubmit={submit}
          onChange={(e) => {
            if (!item && e.target instanceof HTMLElement && e.target.getAttribute('name'))
              setDuplicateDraft(readDuplicateDraft(e.currentTarget, isSystem));
          }}
          aria-busy={busy || valuing}
          onKeyDown={(e) => {
            if (!canAddAnother || e.key !== 'Enter' || !(e.ctrlKey || e.metaKey)) return;
            // Scope the shortcut to this modal, including when another dialog is on top.
            if (
              !(e.target instanceof Element) ||
              e.target.closest('dialog') !== e.currentTarget.closest('dialog')
            )
              return;
            e.preventDefault();
            if (
              e.repeat ||
              e.nativeEvent.isComposing ||
              saveLock.current ||
              valuationLock.current ||
              scanning
            )
              return;
            if (rapidButton.current) e.currentTarget.requestSubmit(rapidButton.current);
          }}
        >
          <fieldset key={generation} className="item-form-fields" disabled={busy || valuing}>
            <div className="form-body">
              <p ref={startRef} className="form-intro" tabIndex={-1}>
                {isSystem
                  ? 'Catalog a computer you own, whether it came prebuilt or you assembled it yourself.'
                  : 'Give your hardware a home. You can fill in the finer details later.'}
              </p>
              {!item && (
                <HardwareScanner
                  isSystem={isSystem}
                  onBusyChange={setScanning}
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
              <ItemFields
                onConnectivityChange={!item ? updateDuplicateDraft : undefined}
                duplicateMatches={
                  !item ? (
                    <DuplicateMatches
                      key={`${generation}:${JSON.stringify(duplicateDraft)}`}
                      draft={duplicateDraft}
                      locations={meta.data!.locations}
                      onMerge={addQuantity}
                      busy={busy || valuing}
                    />
                  ) : undefined
                }
                item={item ?? defaults}
                connectivityOverride={scanConnectivity}
                isSystem={isSystem}
                meta={meta.data!}
                autoFocus={generation === 0}
                keepCategory={keepCategory}
                onKeepCategoryChange={canAddAnother ? setKeepCategory : undefined}
              />
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
          <div className={`modal-footer ${canAddAnother ? 'rapid-entry-footer' : ''}`}>
            {canAddAnother && (
              <div className="rapid-entry-status muted small-text">
                <span className="sr-only" role="status">
                  {generation > 0 ? `Item ${generation} added. Ready for the next.` : ''}
                </span>
                {generation > 0 && (
                  <span>
                    {generation} {generation === 1 ? 'item' : 'items'} added this session
                  </span>
                )}
                <span className="rapid-entry-shortcut">Ctrl/⌘ + Enter to save & add another</span>
              </div>
            )}
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
            {canAddAnother && (
              <button
                ref={rapidButton}
                type="submit"
                className="button secondary rapid-entry-save"
                disabled={busy || valuing || scanning}
                aria-keyshortcuts="Control+Enter Meta+Enter"
              >
                Save &amp; add another
              </button>
            )}
          </div>
        </form>
      )}
    </Modal>
  );
}
