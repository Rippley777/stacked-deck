import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Cpu, Plus } from 'lucide-react';
import type { InventoryItem } from '../../shared/types';
import { api, useResource } from '../api';
import { useApp } from '../context';
import { ErrorState } from './ui';
export function ComputerSpecs({ item }: { item: InventoryItem }) {
  const specs = item.systemSpecs;
  if (!specs) return null;
  return (
    <section className="detail-notes">
      <h3>Computer specifications</h3>
      <dl className="details-grid system-specs">
        {[
          ['Build origin', specs.buildType],
          ['Processor', specs.processor],
          ['Graphics', specs.graphics],
          ['Memory', specs.memoryGB === null ? '' : `${specs.memoryGB} GB`],
          ['Storage', specs.storage],
          ['Motherboard', specs.motherboard],
          ['Power supply', specs.powerSupply],
          ['Operating system', specs.operatingSystem],
        ].map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value || 'Not recorded'}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
export function SystemParts({ system }: { system: InventoryItem }) {
  const { revision, refresh, notify } = useApp();
  const [q, setQ] = useState('');
  const [itemId, setItemId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const parts = useResource<{ items: InventoryItem[] }>(
    `/inventory?kind=Component&status=Available&limit=100&q=${encodeURIComponent(q)}`,
    revision,
  );
  const locked = system.assignments.length > 0 || ['Sold', 'Archived'].includes(system.status);
  async function mutate(path: string, method: string, body?: object) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      refresh();
      notify(
        method === 'POST'
          ? 'Part linked to this computer.'
          : 'Part returned to your available deck.',
      );
      setItemId('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function install(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    void mutate(`/inventory/${system.id}/components`, 'POST', {
      itemId,
      quantity: Number(form.get('quantity')),
    });
  }
  return (
    <section className="detail-notes system-parts">
      <div className="requirements-heading">
        <h3>Installed parts</h3>
        <span className="count-pill">
          {system.components.reduce((n, c) => n + c.quantity, 0)} UNITS
        </span>
      </div>
      <p className="muted small-text">
        Link parts already in your deck. Installed units stay with this computer and cannot be
        reserved for another build. Descriptive specifications do not create inventory cards.
      </p>
      {!system.components.length && (
        <p className="muted small-text">
          No individual parts linked. A prebuilt computer can be cataloged using specifications
          alone.
        </p>
      )}
      {system.components.map((c) => (
        <div className="allocation-row" key={c.id}>
          <Cpu size={18} />
          <span>
            <Link className="text-link" to={`/deck?item=${c.itemId}`}>
              {c.itemName}
            </Link>
            <small>
              ×{c.quantity} · {c.category}
            </small>
          </span>
          <button
            className="button ghost"
            disabled={busy || locked}
            onClick={() => void mutate(`/inventory/${system.id}/components/${c.id}`, 'DELETE')}
          >
            Remove part
          </button>
        </div>
      ))}
      {locked ? (
        <p className="muted small-text">
          Release this computer from projects and restore it before changing installed parts.
        </p>
      ) : (
        <form className="assign-form" onSubmit={install}>
          <input
            aria-label="Search spare parts"
            placeholder="Search your spare parts…"
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setItemId('');
            }}
          />
          <div>
            <select
              required
              aria-label="Part to install"
              value={itemId}
              onChange={(e) => setItemId(e.target.value)}
            >
              <option value="">
                {parts.loading ? 'Loading…' : 'Choose a part from your deck'}
              </option>
              {parts.data?.items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} ({i.availableQuantity} available)
                </option>
              ))}
            </select>
            <input
              aria-label="Quantity to install"
              name="quantity"
              type="number"
              min="1"
              max={parts.data?.items.find((i) => i.id === itemId)?.availableQuantity || 100000}
              defaultValue="1"
              required
            />
            <button className="button primary" disabled={busy || !itemId || parts.loading}>
              <Plus size={16} />
              Link part
            </button>
          </div>
        </form>
      )}
      {parts.error && <ErrorState message={parts.error} retry={parts.reload} />}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
