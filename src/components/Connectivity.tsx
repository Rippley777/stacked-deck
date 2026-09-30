import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { InventoryItem } from '../../shared/types';
import {
  statusLabels,
  type CompatibilityMatch,
  type CompatibilityResult,
  type Connectivity,
} from '../../shared/connectivity';
import { api, useResource } from '../api';
import { useApp } from '../context';

function describe(value: unknown): string {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  if (Array.isArray(value)) return value.map(describe).join(' · ');
  if (value && typeof value === 'object')
    return Object.entries(value)
      .map(([k, v]) => `${labels[k] || k.replace(/([A-Z])/g, ' $1').toLowerCase()}: ${describe(v)}`)
      .join(' / ');
  return String(value).replaceAll('_', ' ');
}
const labels: Record<string, string> = {
  voltage: 'V',
  current: 'A',
  wattage: 'W',
  maxPowerW: 'Maximum W',
  maxDataGbps: 'Gbps',
  outerMm: 'Outer mm',
  innerMm: 'Inner mm',
  lengthM: 'Length (m)',
  acDc: 'AC / DC',
  pd: 'USB-PD',
  pdProfiles: 'PD profiles',
  hz: 'Hz',
  recommendedW: 'Recommended W',
  maxVoltage: 'Rated V',
  maxCurrent: 'Rated A',
  perPortW: 'Available W on port',
  a: 'Connector A',
  b: 'Connector B',
};
export function ConnectivitySummary({ value }: { value?: Connectivity | null }) {
  if (!value)
    return (
      <p className="muted small-text">
        No connection or power specifications yet. Edit this item to add what it needs.
      </p>
    );
  return (
    <div className="connectivity-summary">
      {(['cable', 'adapter', 'power', 'connections'] as const).map(
        (key) =>
          value[key] && (
            <details key={key} open>
              <summary>
                {
                  {
                    cable: 'Cable capabilities',
                    adapter: 'Power adapter output',
                    power: 'Device needs',
                    connections: 'Connections',
                  }[key]
                }
              </summary>
              {key === 'connections' ? (
                value.connections?.map((c, i) => (
                  <p key={i}>
                    {c.label || c.purpose}: {describe(c)}
                  </p>
                ))
              ) : (
                <dl className="spec-summary">
                  {Object.entries(value[key]!).map(([k, v]) => (
                    <div key={k}>
                      <dt>{labels[k] || k.replace(/([A-Z])/g, ' $1')}</dt>
                      <dd>{describe(v)}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </details>
          ),
      )}
      {value.evidence && <p className="muted small-text">Evidence: {value.evidence}</p>}
      <p className="small-text">
        {value.verified
          ? 'Specifications marked reviewed.'
          : 'Specifications need review before compatibility can be confirmed.'}
      </p>
    </div>
  );
}
export function CompatibilityExplanation({ result }: { result: CompatibilityResult }) {
  return (
    <div className={`compatibility-explanation ${result.status}`}>
      <strong>{statusLabels[result.status]}</strong>
      <ul>
        {result.reasons.map((reason, i) => (
          <li key={i}>{reason}</li>
        ))}
      </ul>
      <p className="muted small-text">{result.scope}</p>
    </div>
  );
}
export function MatchResults({ matches }: { matches: CompatibilityMatch[] }) {
  const [showRejected, setShowRejected] = useState(false);
  const rejected = matches.filter((m) => ['incompatible', 'unsafe'].includes(m.result.status));
  const visible = matches.filter(
    (m) => showRejected || !['incompatible', 'unsafe'].includes(m.result.status),
  );
  return (
    <div className="compatibility-matches" aria-live="polite">
      {!visible.length && (
        <p>
          No matching items with enough recorded specifications were found. Add or verify
          specifications on your equipment and accessories.
        </p>
      )}
      {visible.map((m, i) => (
        <article className="compatibility-card" key={`${m.itemId}-${i}`}>
          <div className="compatibility-card-heading">
            <Link to={`/deck?item=${m.itemId}`}>{m.name}</Link>
            <span>{m.requirement}</span>
          </div>
          <p className="small-text">
            📍 {m.location || 'Location not recorded'} · {m.quantity} owned ·{' '}
            {m.availableQuantity > 0 ? `${m.availableQuantity} available` : 'Currently unavailable'}
          </p>
          <CompatibilityExplanation result={m.result} />
        </article>
      ))}
      {rejected.length > 0 && (
        <button type="button" className="button ghost" onClick={() => setShowRejected((v) => !v)}>
          {showRejected ? 'Hide' : 'Show'} {rejected.length} incompatible or unsafe results
        </button>
      )}
    </div>
  );
}
function PowerComparison({ item }: { item: InventoryItem }) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const inventory = useResource<{ items: InventoryItem[]; total: number }>(
    `/inventory?accessory=adapter&limit=100&page=${page}&q=${encodeURIComponent(search)}`,
  );
  const [adapterId, setAdapterId] = useState('');
  const [result, setResult] = useState<CompatibilityResult>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div className="power-comparison">
      <label>
        Search your chargers
        <input
          value={search}
          placeholder="Charger name or model"
          onChange={(e) => {
            setSearch(e.target.value);
            setPage(1);
            setAdapterId('');
            setResult(undefined);
          }}
        />
      </label>
      <label>
        Compare a specific charger
        <select
          value={adapterId}
          onChange={(e) => {
            setAdapterId(e.target.value);
            setResult(undefined);
          }}
        >
          <option value="">Choose one of your chargers</option>
          {inventory.data?.items.map((i) => (
            <option key={i.id} value={i.id}>
              {i.name} · {i.locationName || 'No location'}
            </option>
          ))}
        </select>
      </label>
      {inventory.data && inventory.data.total > 100 && (
        <div className="scan-actions">
          <button
            type="button"
            className="button ghost"
            disabled={page === 1}
            onClick={() => {
              setPage((p) => p - 1);
              setAdapterId('');
            }}
          >
            Previous chargers
          </button>
          <button
            type="button"
            className="button ghost"
            disabled={page * 100 >= inventory.data.total}
            onClick={() => {
              setPage((p) => p + 1);
              setAdapterId('');
            }}
          >
            More chargers
          </button>
        </div>
      )}
      {inventory.error && <p role="alert">{inventory.error}</p>}
      <button
        type="button"
        className="button secondary"
        disabled={!adapterId || busy}
        onClick={async () => {
          setBusy(true);
          setError('');
          try {
            setResult(
              await api('/hardware/compatibility', {
                method: 'POST',
                body: JSON.stringify({ deviceId: item.id, adapterId }),
              }),
            );
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? 'Checking…' : 'Will this power my device?'}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && <CompatibilityExplanation result={result} />}
    </div>
  );
}
export function ItemConnectivity({ item }: { item: InventoryItem }) {
  const { revision } = useApp();
  const [open, setOpen] = useState(false);
  const r = useResource<{ matches: CompatibilityMatch[] }>(
    `/inventory/${item.id}/compatibility`,
    revision,
  );
  const reverse = item.connectivity?.cable || item.connectivity?.adapter;
  return (
    <section className="item-connectivity">
      <h3>Cables & power</h3>
      <ConnectivitySummary value={item.connectivity} />
      <button
        type="button"
        className="button primary"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {reverse ? 'What uses this?' : 'What do I need?'}
      </button>
      {open && (
        <>
          <p className="muted small-text">
            Your inventory, ordered by requirements met and availability. Each result applies to the
            indicated connection. Unknown specifications cannot establish safety.
          </p>
          {r.loading ? (
            <p role="status">Checking your inventory…</p>
          ) : r.error ? (
            <p role="alert">{r.error}</p>
          ) : (
            <MatchResults matches={r.data?.matches || []} />
          )}
          {!reverse && <PowerComparison item={item} />}
        </>
      )}
    </section>
  );
}
