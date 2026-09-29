import { useState, useRef } from 'react';
import { RotateCw } from 'lucide-react';
import type { InventoryItem } from '../../shared/types';
import {
  gain,
  valuationLimits,
  type Valuation,
  type ValuationRecord,
  type ValuePoint,
} from '../../shared/valuation';
import { api, date, money, useResource } from '../api';
import { useApp } from '../context';
import { ErrorState, Field } from './ui';

export function ValuationSummary({ value }: { value: Valuation }) {
  return (
    <div className="valuation-summary">
      <strong>
        {money(value.estimatedValueCents, true)} <small>estimated per unit</small>
      </strong>
      <p>
        Typical range: {money(value.lowEstimateCents)}–{money(value.highEstimateCents)} ·
        Confidence: {value.confidence}
      </p>
      <p className="muted small-text">{value.explanation}</p>
      <p className="muted small-text">
        AI estimate without live sales data. Actual resale prices vary.
      </p>
    </div>
  );
}
export function ValueChart({ points, label }: { points: ValuePoint[]; label: string }) {
  if (!points.length)
    return <p className="muted small-text">History begins with your first saved value.</p>;
  const start = Date.parse(points[0].date),
    end = Date.parse(points.at(-1)!.date);
  const max = Math.max(...points.map((p) => p.valueCents), 1);
  const coords = points.map((p) => ({
    x: 64 + (end === start ? 0.5 : (Date.parse(p.date) - start) / (end - start)) * 500,
    y: 160 - (p.valueCents / max) * 130,
  }));
  const path = coords.map((p, i) => (i ? `H ${p.x} V ${p.y}` : `M ${p.x} ${p.y}`)).join(' ');
  return (
    <figure className="value-chart">
      <figcaption>{label}</figcaption>
      <svg
        viewBox="0 0 600 205"
        role="img"
        aria-label={`${label}. ${points.length} observations; latest ${money(points.at(-1)!.valueCents)}.`}
      >
        <text x="4" y="34">
          {money(max)}
        </text>
        <text x="4" y="164">
          $0
        </text>
        <line x1="64" y1="160" x2="564" y2="160" className="chart-axis" />
        <path d={path} className="chart-line" />
        {coords.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r="3" className="chart-point">
            <title>
              {date(points[i].date)}: {money(points[i].valueCents, true)}
            </title>
          </circle>
        ))}
        <text x="64" y="192">
          {date(points[0].date)}
        </text>
        {points.length > 1 && (
          <text x="564" y="192" textAnchor="end">
            {date(points.at(-1)!.date)}
          </text>
        )}
      </svg>
      <details>
        <summary>View values</summary>
        <div className="valuation-table">
          <table>
            <thead>
              <tr>
                <th>Date (UTC)</th>
                <th>Estimated value</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={i}>
                  <td>{date(p.date)}</td>
                  <td>{money(p.valueCents, true)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
export function ItemValuation({ item }: { item: InventoryItem }) {
  const { revision, refresh, notify } = useApp();
  const history = useResource<ValuationRecord[]>(`/inventory/${item.id}/valuations`, revision);
  const [proposal, setProposal] = useState<ValuationRecord>();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const [manual, setManual] = useState(
    item.manualValueOverrideCents === null ? '' : String(item.manualValueOverrideCents / 100),
  );
  const [replaceManual, setReplaceManual] = useState(false);
  const change = gain(item.estimatedValueCents, item.purchasePriceCents);
  async function action(run: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await run();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function estimate() {
    await action(async () => {
      const result = await api<{ record: ValuationRecord | null; message: string }>(
        `/inventory/${item.id}/valuation`,
        { method: 'POST', body: '{}' },
      );
      if (!result.record) {
        setError(result.message);
        return;
      }
      setProposal(result.record);
      history.reload();
    });
  }
  async function apply() {
    if (!proposal) return;
    await action(async () => {
      await api(`/inventory/${item.id}/valuation`, {
        method: 'PUT',
        body: JSON.stringify({ valuationId: proposal.id, replaceManual }),
      });
      setProposal(undefined);
      refresh();
      notify('Valuation saved to history.');
    });
  }
  const points = (history.data ?? [])
    .filter((r) => r.appliedAt && r.effectiveValueCents !== null)
    .sort((a, b) => a.appliedAt!.localeCompare(b.appliedAt!))
    .map((r) => ({ date: r.appliedAt!, valueCents: r.effectiveValueCents! }));
  return (
    <section className="detail-notes valuation-panel" aria-label="Equipment valuation">
      <div className="section-heading compact">
        <h3>Equipment valuation</h3>
        <button type="button" className="button secondary" disabled={busy} onClick={estimate}>
          <RotateCw size={15} />
          {busy ? 'Working…' : 'Refresh valuation'}
        </button>
      </div>
      <p className="muted small-text">
        Review a new estimate before applying it. Hardware details are sent to OpenAI only when
        requested.
      </p>
      <dl className="details-grid">
        <div>
          <dt>Effective value per unit</dt>
          <dd>
            {item.estimatedValueCents === null
              ? 'Not valued'
              : money(item.estimatedValueCents, true)}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>
            {item.manualValueOverrideCents !== null
              ? 'Manual override'
              : item.aiValuation
                ? 'AI estimate'
                : 'Not set'}
          </dd>
        </div>
        <div>
          <dt>Change from purchase price</dt>
          <dd>
            {change.cents === null
              ? 'Add a price and value to compare'
              : `${money(change.cents, true)} (${change.percent === null ? 'N/A' : change.percent.toFixed(1) + '%'})`}
          </dd>
        </div>
        <div>
          <dt>Last value update</dt>
          <dd>{item.valuationUpdatedAt ? date(item.valuationUpdatedAt) : 'Never'}</dd>
        </div>
      </dl>
      {item.aiValuation && <ValuationSummary value={item.aiValuation} />}
      {item.valuationUpdatedAt &&
        Date.now() - Date.parse(item.valuationUpdatedAt) > valuationLimits.staleAfterMs && (
          <p className="muted small-text">
            This value is more than seven days old. Refresh when you need a newer estimate.
          </p>
        )}
      <form
        className="manual-value-form"
        onSubmit={(e) => {
          e.preventDefault();
          void action(async () => {
            await api(`/inventory/${item.id}/manual-value`, {
              method: 'PUT',
              body: JSON.stringify({
                valueCents: manual === '' ? null : Math.round(Number(manual) * 100),
              }),
            });
            refresh();
            notify(manual === '' ? 'Manual override cleared.' : 'Manual value saved.');
          });
        }}
      >
        <Field
          label="Manual value per unit ($)"
          hint="Leave blank to use the latest accepted AI estimate. Zero is a valid override."
        >
          <input
            type="number"
            min="0"
            max="10000000"
            step="0.01"
            value={manual}
            onChange={(e) => setManual(e.target.value)}
            disabled={busy}
          />
        </Field>
        <button className="button secondary" disabled={busy}>
          Save manual value
        </button>
      </form>
      {busy && <p role="status">Working on your valuation…</p>}
      {proposal?.valuation && (
        <div className="valuation-review" aria-label="Review valuation">
          <h4>Review new estimate</h4>
          <ValuationSummary value={proposal.valuation} />
          {item.manualValueOverrideCents !== null && (
            <label className="valuation-checkbox">
              <input
                type="checkbox"
                checked={replaceManual}
                onChange={(e) => setReplaceManual(e.target.checked)}
              />{' '}
              Replace my manual value with this AI estimate
            </label>
          )}
          <div className="scan-actions">
            <button type="button" className="button primary" disabled={busy} onClick={apply}>
              {item.manualValueOverrideCents !== null && !replaceManual
                ? 'Save AI estimate; keep manual value'
                : 'Apply estimate'}
            </button>
            <button
              type="button"
              className="button ghost"
              disabled={busy}
              onClick={() => setProposal(undefined)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {history.loading ? (
        <p role="status">Loading valuation history…</p>
      ) : history.error ? (
        <ErrorState message={history.error} retry={history.reload} />
      ) : (
        <>
          <ValueChart points={points} label="Value per unit over time" />
          <details>
            <summary>Valuation history ({history.data?.length ?? 0})</summary>
            {[...(history.data ?? [])].reverse().map((record) => (
              <div className="valuation-history-row" key={record.id}>
                <span>
                  {date(record.createdAt)} · {record.source} ·{' '}
                  {record.appliedAt ? 'Applied' : 'Pending review'}
                  <small>
                    {record.source === 'ai' && record.valuation
                      ? money(record.valuation.estimatedValueCents, true)
                      : record.effectiveValueCents === null
                        ? 'Value cleared'
                        : money(record.effectiveValueCents, true)}
                  </small>
                </span>
                {!record.appliedAt && (
                  <button
                    type="button"
                    className="button ghost"
                    disabled={busy}
                    onClick={() => {
                      setProposal(record);
                      setReplaceManual(false);
                    }}
                  >
                    Review
                  </button>
                )}
              </div>
            ))}
          </details>
        </>
      )}
    </section>
  );
}
