import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Check,
  Circle,
  ArrowUpRight,
  Sparkles,
  Clock3,
  ArrowRight,
  Info,
  ChevronDown,
} from 'lucide-react';
import type { Project, Recommendation } from '../../shared/types';
import { api, money, useResource } from '../api';
import { useApp } from '../context';
import {
  Badge,
  Empty,
  ErrorState,
  Loading,
  Modal,
  PageHeading,
  TemplateIcon,
} from '../components/ui';
export function MatchDetails({ result }: { result: Recommendation }) {
  return (
    <div className="match-details">
      <div className="match-summary">
        <Badge>{result.status}</Badge>
        <strong>{result.readiness}% ready</strong>
      </div>
      <div className="progress-track">
        <span style={{ width: `${result.readiness}%` }} />
      </div>
      <h4>THE ESSENTIALS</h4>
      {result.required.map((r) => (
        <div
          className={`requirement-match ${r.missingQuantity ? 'missing' : ''}`}
          key={r.requirement.id}
        >
          {r.missingQuantity ? <Circle size={16} /> : <Check size={16} />}
          <div>
            <strong>
              {r.requirement.name} <span>×{r.requirement.quantity}</span>
            </strong>
            {r.matched.map((m) => (
              <p key={m.itemId}>
                {m.name} ×{m.quantity}
              </p>
            ))}
            {r.missingQuantity > 0 && (
              <p className="missing-copy">
                Missing {r.missingQuantity} · about{' '}
                {money(r.missingQuantity * r.requirement.estimatedUnitCostCents)} to add
              </p>
            )}
          </div>
        </div>
      ))}
      {result.optional.length > 0 && (
        <>
          <h4>NICE TO HAVE · OPTIONAL</h4>
          {result.optional.map((r) => (
            <div
              className={`requirement-match optional ${r.missingQuantity ? 'unmatched' : ''}`}
              key={r.requirement.id}
            >
              {r.matched.length ? <Check size={16} /> : <Circle size={16} />}
              <div>
                <strong>{r.requirement.name}</strong>
                <p>
                  {r.matched.length
                    ? r.matched.map((m) => `${m.name} ×${m.quantity}`).join(', ')
                    : 'Not in your available deck'}
                </p>
              </div>
            </div>
          ))}
        </>
      )}
      <div className="match-cost">
        <span>
          Estimated additional purchases<small>Required parts only · rough estimates in USD</small>
        </span>
        <strong>{money(result.additionalCostCents)}</strong>
      </div>
      <p className="compatibility-note">
        <Info size={15} />
        {result.template.caveat}
      </p>
    </div>
  );
}
export default function RecommendationsPage() {
  const { revision, refresh, notify } = useApp();
  const r = useResource<Recommendation[]>('/recommendations', revision);
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('All possibilities');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const selected = r.data?.find((v) => v.template.id === params.get('template'));
  const ready = r.data?.filter((v) => !v.missingCount).length || 0;
  async function start(result: Recommendation) {
    setBusy(true);
    setError('');
    try {
      const project = await api<Project>(`/templates/${result.template.id}/projects`, {
        method: 'POST',
        body: '{}',
      });
      refresh();
      notify('Project created. Assign hardware to reserve your parts.');
      navigate(`/projects?project=${project.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const results = r.data?.filter(
    (v) =>
      filter === 'All possibilities' ||
      (filter === 'Ready to build' ? !v.missingCount : v.missingCount > 0 && v.missingCount <= 2),
  );
  return (
    <>
      <PageHeading
        eyebrow="PLAY THE HAND YOU HAVE"
        title="What can I build?"
        description="Good ideas, hiding in the hardware you already own."
      />
      <div className="recommendation-banner">
        <span className="banner-spark">
          <Sparkles size={26} />
        </span>
        <div>
          <h2>
            {ready
              ? `${ready} projects. Zero new hardware.`
              : 'Every great build starts with a few good parts.'}
          </h2>
          <p>
            {ready
              ? 'Your deck has the essentials. Pick a project and make something of it.'
              : 'Explore the possibilities and see exactly what your next build needs.'}
          </p>
        </div>
        <span className="banner-decor">♧</span>
      </div>
      <div className="build-tabs">
        {['All possibilities', 'Ready to build', 'Almost ready'].map((t) => (
          <button key={t} className={filter === t ? 'active' : ''} onClick={() => setFilter(t)}>
            {t}
            {t === 'Ready to build' && <span>{ready}</span>}
          </button>
        ))}
        <span className="sort-note">
          FEWEST MISSING PARTS FIRST <ChevronDown size={12} />
        </span>
      </div>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !results?.length ? (
        <Empty
          title="Nothing here just yet."
          action={
            <button className="button secondary" onClick={() => setFilter('All possibilities')}>
              Explore all possibilities
            </button>
          }
        >
          Add more available hardware or explore projects with a few missing parts.
        </Empty>
      ) : (
        <div className="recommendations-grid">
          {results.map((result) => (
            <article className="recommendation-card" key={result.template.id}>
              <div className="recommendation-top">
                <span className={`template-icon large ${result.template.accent}`}>
                  <TemplateIcon name={result.template.icon} size={25} />
                </span>
                <Badge>{result.status}</Badge>
              </div>
              <h2>{result.template.name}</h2>
              <p className="recommendation-description">{result.template.description}</p>
              <div className="project-meta">
                <span>
                  <Clock3 size={13} />
                  {result.template.duration}
                </span>
                <span>{result.template.difficulty}</span>
              </div>
              <div className="readiness-label">
                <span>{result.readiness}% ready</span>
                <span>
                  {result.missingCount
                    ? `${result.missingCount} missing`
                    : 'You have the essentials'}
                </span>
              </div>
              <div className="progress-track">
                <span style={{ width: `${result.readiness}%` }} />
              </div>
              <div className="preview-matches">
                {result.required.map((m) => (
                  <div key={m.requirement.id}>
                    {m.missingQuantity ? <Circle size={13} /> : <Check size={13} />}
                    <span>
                      {m.matched.length
                        ? m.matched.map((v) => `${v.name} ×${v.quantity}`).join(', ')
                        : m.requirement.name}
                    </span>
                    {m.missingQuantity > 0 && <small>Missing {m.missingQuantity}</small>}
                  </div>
                ))}
              </div>
              <div className="recommendation-footer">
                <span>
                  {result.additionalCostCents ? (
                    <>
                      About <strong>{money(result.additionalCostCents)}</strong> to add
                    </>
                  ) : (
                    <>
                      <strong>$0</strong> in new hardware
                    </>
                  )}
                </span>
                <button
                  className="text-link"
                  onClick={() => {
                    setParams({ template: result.template.id });
                    setError('');
                  }}
                >
                  Explore build
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="recommendation-disclaimer">
        <Info size={16} />
        <p>
          Built from your available inventory using categories and tags. Each suggestion is an
          independent possibility; hardware is only reserved when you assign it to a project. Always
          check exact specifications.
        </p>
      </div>
      {selected && (
        <Modal title={selected.template.name} onClose={() => setParams({})}>
          <div className="form-body">
            <p className="form-intro">{selected.template.description}</p>
            <MatchDetails result={selected} />
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button className="button secondary" onClick={() => setParams({})}>
              Keep exploring
            </button>
            <button className="button primary" disabled={busy} onClick={() => start(selected)}>
              {busy ? 'Creating…' : 'Make this a project'}
              <ArrowRight size={16} />
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
