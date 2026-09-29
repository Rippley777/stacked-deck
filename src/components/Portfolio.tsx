import { useState } from 'react';
import type { Portfolio } from '../../shared/valuation';
import { money, useResource } from '../api';
import { useApp } from '../context';
import { ErrorState, Loading } from './ui';
import { ValueChart } from './Valuation';
import { ItemDetail } from '../pages/Inventory';
export function PortfolioPanel() {
  const { revision } = useApp();
  const r = useResource<Portfolio>('/portfolio/valuation', revision);
  const [queue, setQueue] = useState(false);
  const [selected, setSelected] = useState('');
  if (r.loading && !r.data) return <Loading />;
  if (r.error || !r.data) return <ErrorState message={r.error} retry={r.reload} />;
  const p = r.data;
  return (
    <section className="panel portfolio-panel" aria-label="Hardware portfolio">
      <div className="section-heading">
        <div>
          <h2>Your hardware portfolio</h2>
          <p>Estimated resale value, tracked as your collection changes.</p>
        </div>
        <button
          className="button secondary"
          disabled={!p.missingValues.length}
          onClick={() => setQueue(!queue)}
        >
          Value my collection
        </button>
      </div>
      <div className="portfolio-metrics">
        <div>
          <span>Current estimated value</span>
          <strong>{money(p.totalValueCents, true)}</strong>
        </div>
        <div>
          <span>Known amount spent</span>
          <strong>{money(p.totalSpentCents, true)}</strong>
        </div>
        <div>
          <span>Value minus known spend</span>
          <strong>
            {money(p.gainCents, true)}{' '}
            <small>({p.gainPercent === null ? 'N/A' : p.gainPercent.toFixed(1) + '%'})</small>
          </strong>
        </div>
      </div>
      <p className="muted small-text">
        {p.missingValues.length} cards without a direct value · {p.missingPurchasePrices} holdings
        without a complete purchase price. Missing amounts contribute zero to totals. For holdings
        with both prices recorded, change is {money(p.comparableGainCents, true)} (
        {p.comparableGainPercent === null ? 'N/A' : p.comparableGainPercent.toFixed(1) + '%'}).
      </p>
      {queue && (
        <div className="valuation-review">
          <h3>Value unpriced hardware</h3>
          <p className="muted small-text">
            Choose a card, confirm its model, then refresh and review its estimate. Each refresh
            uses one AI request; nothing runs in the background.
          </p>
          <div className="valuation-queue">
            {p.missingValues.map((i) => (
              <button className="button secondary" key={i.id} onClick={() => setSelected(i.id)}>
                {i.name}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="portfolio-columns">
        <ValueChart points={p.history} label="Collection value over time" />
        <div>
          <h3>Value by category</h3>
          {p.categories.length ? (
            p.categories.map((c) => (
              <div className="portfolio-category" key={c.name}>
                <span>{c.name}</span>
                <strong>{money(c.valueCents)}</strong>
                <meter
                  min="0"
                  max={Math.max(p.totalValueCents, 1)}
                  value={c.valueCents}
                  aria-label={`${c.name} share of value`}
                />
              </div>
            ))
          ) : (
            <p className="muted">Add hardware to start your portfolio.</p>
          )}
        </div>
      </div>
      <p className="muted small-text">
        History uses recorded values and holdings at each point, including additions and removals.
        It is not an investment return or a live market price. Computer values include installed
        parts.
      </p>
      {p.mostValuable && (
        <button className="text-link" onClick={() => setSelected(p.mostValuable!.id)}>
          Most valuable holding: {p.mostValuable.name} · {money(p.mostValuable.valueCents)}
        </button>
      )}
      {selected && <ItemDetail id={selected} onClose={() => setSelected('')} />}
    </section>
  );
}
