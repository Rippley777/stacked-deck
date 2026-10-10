import { useEffect, useState } from 'react';
import { api } from '../api';
import {
  hasDuplicateIdentity,
  type DuplicateDraft,
  type DuplicateMatch,
} from '../../shared/duplicates';
import type { Location } from '../../shared/types';

export function readDuplicateDraft(form: HTMLFormElement, isSystem: boolean): DuplicateDraft {
  const data = new FormData(form);
  const str = (key: string) => String(data.get(key) || '');
  const cents = (key: string) => (str(key) ? Math.round(Number(str(key)) * 100) : null);
  return {
    name: str('name'),
    manufacturer: str('manufacturer'),
    model: str('model'),
    category: str('category'),
    serialNumber: str('serialNumber'),
    kind: isSystem ? 'System' : 'Component',
    condition: str('condition') as DuplicateDraft['condition'],
    status: str('status') as DuplicateDraft['status'],
    locationId: str('locationId') || null,
    notes: str('notes'),
    tags: str('tags')
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean),
    purchaseDate: str('purchaseDate') || null,
    purchasePriceCents: cents('purchasePrice'),
    estimatedValueCents: cents('estimatedValue'),
    imageUrl: str('imageUrl'),
    connectivity: str('connectivity') ? JSON.parse(str('connectivity')) : undefined,
  };
}

export function DuplicateMatches({
  draft,
  locations,
  onMerge,
  busy,
}: {
  draft: DuplicateDraft | null;
  locations: Location[];
  onMerge: (id: string, quantity: number) => Promise<void>;
  busy: boolean;
}) {
  const key = JSON.stringify(draft);
  const [response, setResponse] = useState<{
    key: string;
    items: DuplicateMatch[];
    total: number;
    error?: string;
  }>();
  const [selection, setSelection] = useState({ key: '', id: '', quantity: '1' });
  const [expanded, setExpanded] = useState('');
  const [separate, setSeparate] = useState('');
  useEffect(() => {
    const candidate = JSON.parse(key) as DuplicateDraft | null;
    if (!candidate || !hasDuplicateIdentity(candidate)) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      api<{ items: DuplicateMatch[]; total: number }>('/hardware/duplicates', {
        method: 'POST',
        body: key,
        signal: controller.signal,
      })
        .then((result) => {
          if (!controller.signal.aborted) setResponse({ ...result, key });
        })
        .catch((error: Error) => {
          if (!controller.signal.aborted)
            setResponse({ key, items: [], total: 0, error: error.message });
        });
    }, 450);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [key]);
  // Hide old results synchronously, including the interval before effect cleanup.
  if (response?.key !== key) return null;
  if (response.error)
    return (
      <p className="duplicate-lookup-error muted small-text" role="status">
        Could not check your deck: {response.error} You can still save this card.
      </p>
    );
  if (!response.items.length) return null;
  const shown = expanded === key ? response.items : response.items.slice(0, 3);
  return (
    <section className="full manual-duplicates" aria-label="Possible matches in your deck">
      <h3>Possible matches in your deck</h3>
      <p className="muted small-text">
        Compare these cards. Saving a separate card is always your choice.
      </p>
      {shown.map((match) => {
        const selecting =
          selection.key === key && selection.id === match.itemId && separate !== key;
        const quantity = Number(selection.quantity);
        const valid =
          Number.isInteger(quantity) && quantity > 0 && quantity + match.quantity <= 100000;
        const differentLocation = (draft?.locationId || null) !== match.locationId;
        return (
          <article key={match.itemId} className={`duplicate-card duplicate-${match.matchStrength}`}>
            <div className="duplicate-heading">
              <strong>{match.name}</strong>
              <span className="badge">
                {match.matchStrength === 'exact'
                  ? 'Exact serial match'
                  : match.matchStrength === 'strong'
                    ? 'Strong match'
                    : 'Possible match'}
              </span>
            </div>
            {match.matchStrength === 'exact' && (
              <p className="duplicate-warning" role="alert">
                This may already be in your deck. This serial number already belongs to this card.
              </p>
            )}
            <p className="small-text">
              ×{match.quantity} total · {match.availableQuantity} available ·{' '}
              {match.location || 'No location'}
            </p>
            <p className="small-text">
              {['Archived', 'Sold'].includes(match.status)
                ? `You previously had this item · ${match.status}`
                : match.status}
              {match.installedIn.length > 0 && ` · Installed in ${match.installedIn.join(', ')}`}
              {match.assignedTo.length > 0 && ` · Assigned to ${match.assignedTo.join(', ')}`}
            </p>
            {match.serialNumber && <p className="small-text">Serial: {match.serialNumber}</p>}
            <p className="small-text">{match.reasons.join(' · ')}</p>
            {match.mergeProblem && <p className="muted small-text">{match.mergeProblem}</p>}
            {differentLocation && (
              <p className="small-text">
                This matching card is stored in {match.location || 'No location'}. The item you’re
                adding is in{' '}
                {locations.find((l) => l.id === draft?.locationId)?.name || 'No location'}. Create a
                separate card to preserve location tracking.
              </p>
            )}
            <div className="duplicate-actions">
              <a
                className="button secondary"
                href={`/deck?item=${encodeURIComponent(match.itemId)}`}
                target="_blank"
                rel="noreferrer"
              >
                View item<span className="sr-only"> (opens in a new tab)</span>
              </a>
              {!match.mergeProblem && !selecting && separate !== key && (
                <button
                  type="button"
                  className="button secondary"
                  disabled={busy}
                  onClick={() => setSelection({ key, id: match.itemId, quantity: '1' })}
                >
                  Add to existing quantity
                </button>
              )}
            </div>
            {selecting && (
              <div className="duplicate-quantity">
                <label>
                  Add quantity
                  <input
                    type="number"
                    min="1"
                    max={100000 - match.quantity}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.preventDefault();
                    }}
                    value={selection.quantity}
                    onChange={(e) => setSelection({ ...selection, quantity: e.target.value })}
                  />
                </label>
                <p>
                  {match.quantity} → {valid ? match.quantity + quantity : 'Enter a valid quantity'}
                </p>
                <p className="muted small-text">
                  Keep this card’s details and add these units. No new card will be created.
                </p>
                <div className="duplicate-actions">
                  <button
                    type="button"
                    className="button primary"
                    disabled={busy || !valid}
                    onClick={() => {
                      void onMerge(match.itemId, quantity);
                    }}
                  >
                    Confirm quantity addition
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setSelection({ key: '', id: '', quantity: '1' })}
                  >
                    Cancel quantity addition
                  </button>
                </div>
              </div>
            )}
          </article>
        );
      })}
      {response.items.length > 3 && expanded !== key && (
        <button type="button" className="button ghost" onClick={() => setExpanded(key)}>
          View more matches ({response.items.length})
        </button>
      )}
      {response.total > response.items.length && (
        <p className="muted small-text">
          Showing the top {response.items.length} of {response.total} matches. Add more identifying
          details to narrow them down.
        </p>
      )}
      {separate === key ? (
        <p role="status">Separate card selected. Use the save controls below to finish.</p>
      ) : (
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setSeparate(key);
            setSelection({ key: '', id: '', quantity: '1' });
          }}
        >
          Create separate card anyway
        </button>
      )}
    </section>
  );
}
