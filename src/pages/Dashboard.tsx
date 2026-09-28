import { Link } from 'react-router-dom';
import {
  ArrowRight,
  ArrowUpRight,
  Plus,
  Layers,
  CircleCheck,
  FolderKanban,
  Wallet,
  MapPin,
  Sparkles,
  ChevronRight,
} from 'lucide-react';
import type { Dashboard, Recommendation } from '../../shared/types';
import { useResource, money } from '../api';
import { useApp } from '../context';
import {
  Badge,
  CategoryIcon,
  ErrorState,
  Loading,
  PageHeading,
  TemplateIcon,
  Empty,
} from '../components/ui';
import { HardwareArt, DeckIllustration } from '../components/HardwareArt';
export default function DashboardPage() {
  const { user, revision, addItem } = useApp();
  const resource = useResource<Dashboard>('/dashboard', revision);
  const builds = useResource<Recommendation[]>('/recommendations', revision);
  if (resource.loading) return <Loading />;
  if (resource.error || !resource.data)
    return <ErrorState message={resource.error} retry={resource.reload} />;
  const d = resource.data;
  const colors = ['#bce39b', '#9eaed6', '#d4b68a', '#91b7b3', '#bb9abe', '#727b71'];
  return (
    <>
      <PageHeading
        eyebrow="A LITTLE ORGANIZATION. A LOT OF POSSIBILITY."
        title={`Your hardware. Full of potential.`}
        description={`Welcome back, ${user.name.split(' ')[0]}. Let’s see what’s in your deck.`}
      >
        <button className="button secondary" onClick={addItem}>
          <Plus size={17} />
          Add hardware
        </button>
      </PageHeading>
      <section className="hero">
        <div className="hero-copy">
          <span className="hero-kicker">
            <span />
            THE NEXT GREAT BUILD IS ALREADY IN YOUR DECK
          </span>
          <h2>
            Stack your deck.
            <br />
            <span>Build something.</span>
          </h2>
          <p>
            Turn that collection of “I’ll use it someday”
            <br className="desktop-break" /> into your next weekend project.
          </p>
          <Link to="/build" className="button primary">
            What can I build?
            <ArrowUpRight size={18} />
          </Link>
          <div className="hero-caption">
            <span className="stack-dots">
              ♠ <span>♣</span> ♦
            </span>
            {d.readyCount ? (
              <>
                <strong>{d.readyCount} possible builds</strong> with what you already own
              </>
            ) : (
              <>Your next idea starts with what you own</>
            )}
          </div>
        </div>
        <DeckIllustration />
        <span className="hero-edition">THE PERSONAL HARDWARE COLLECTION / VOL. 01</span>
      </section>
      <section className="stats-grid">
        {[
          {
            label: 'Hardware in your deck',
            value: d.totalUnits,
            icon: Layers,
            note: 'Every component, accounted for',
            tone: '',
          },
          {
            label: 'Available to build',
            value: d.availableUnits,
            icon: CircleCheck,
            note: 'Ready for something new',
            tone: 'green',
          },
          {
            label: 'Components in projects',
            value: d.assignedUnits,
            icon: FolderKanban,
            note: `Across ${d.activeProjects} active ${d.activeProjects === 1 ? 'project' : 'projects'}`,
            tone: 'purple',
          },
          {
            label: 'Estimated deck value',
            value: money(d.totalValueCents),
            icon: Wallet,
            note: 'A collection worth keeping track of',
            tone: 'orange',
          },
        ].map((s) => (
          <div className={`stat-card ${s.tone}`} key={s.label}>
            <div>
              <span>{s.label}</span>
              <s.icon size={17} />
            </div>
            <strong>{s.value}</strong>
            <small>{s.note}</small>
          </div>
        ))}
      </section>
      <section className="dashboard-section">
        <div className="section-heading">
          <div>
            <h2>
              Fresh in your deck <span className="count-pill">RECENTLY ADDED</span>
            </h2>
            <p>The latest additions to your collection.</p>
          </div>
          <Link className="text-link" to="/deck">
            View your deck
            <ArrowRight size={16} />
          </Link>
        </div>
        {!d.recent.length ? (
          <Empty
            title="Your deck starts with one card."
            action={
              <button className="button primary" onClick={addItem}>
                <Plus size={16} />
                Add your first hardware
              </button>
            }
          >
            Add a board, an old drive, or that GPU in the closet.
          </Empty>
        ) : (
          <div className="recent-grid">
            {d.recent.map((i, idx) => (
              <Link to={`/deck?item=${i.id}`} className="hardware-card" key={i.id}>
                <div className={`hardware-visual visual-${idx}`}>
                  <span className="category-label">{i.category}</span>
                  <span className="card-suit">{['♠', '♧', '◇', '♣'][idx]}</span>
                  {i.imageUrl ? (
                    <img src={i.imageUrl} alt={i.name} referrerPolicy="no-referrer" />
                  ) : (
                    <HardwareArt category={i.category} variant={idx} />
                  )}
                  <span className="quantity-label">×{i.quantity}</span>
                </div>
                <div className="hardware-info">
                  <h3>{i.name}</h3>
                  <span className="hardware-location">
                    <MapPin size={12} />
                    {i.locationName || 'No location yet'}
                  </span>
                  <div className="hardware-card-bottom">
                    <Badge tone={i.availableQuantity ? 'available' : 'reserved'}>
                      {i.availableQuantity
                        ? 'Available'
                        : i.assignments.length
                          ? 'In a project'
                          : i.status}
                    </Badge>
                    <span>
                      {i.estimatedValueCents != null ? money(i.estimatedValueCents) : '—'}
                    </span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>
      <div className="dashboard-bottom">
        <section className="panel category-panel">
          <div className="section-heading compact">
            <h2>A look at your deck</h2>
            <Layers size={17} />
          </div>
          <div className="category-legend">
            HARDWARE BY CATEGORY <span>{d.totalUnits} components</span>
          </div>
          {d.categories.length ? (
            <>
              <div className="category-bar">
                {d.categories.map((c, i) => (
                  <div
                    key={c.name}
                    title={`${c.name}: ${c.count}`}
                    style={{ flex: c.count, background: colors[i % colors.length] }}
                  />
                ))}
              </div>
              <div className="category-rows">
                {d.categories.slice(0, 5).map((c, i) => (
                  <Link to={`/deck?category=${encodeURIComponent(c.name)}`} key={c.name}>
                    <span
                      className="category-square"
                      style={{ background: colors[i % colors.length] }}
                    />
                    <CategoryIcon category={c.name} size={15} />
                    <span>{c.name}</span>
                    <strong>{c.count}</strong>
                    <span className="category-percent">
                      {Math.round((c.count / d.totalUnits) * 100)}%
                    </span>
                  </Link>
                ))}
              </div>
              <div className="status-strip">
                {d.statuses.map((s) => (
                  <span key={s.name}>
                    <span className={`status-dot ${s.name.toLowerCase().replaceAll(' ', '-')}`} />
                    {s.name} <strong>{s.count}</strong>
                  </span>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Your collection breakdown will appear here.</p>
          )}
        </section>
        <section className="panel possible-panel">
          <div className="section-heading compact">
            <h2>
              <Sparkles size={18} /> Your next possible hand
            </h2>
            <Link className="text-link" to="/build">
              Explore all
              <ArrowUpRight size={15} />
            </Link>
          </div>
          <p className="panel-intro">A few ideas hiding in the hardware you already have.</p>
          {builds.loading ? (
            <Loading />
          ) : builds.error ? (
            <ErrorState message={builds.error} retry={builds.reload} />
          ) : (
            builds.data?.slice(0, 3).map((r) => (
              <Link
                to={`/build?template=${r.template.id}`}
                className="possible-row"
                key={r.template.id}
              >
                <span className={`template-icon ${r.template.accent}`}>
                  <TemplateIcon name={r.template.icon} size={21} />
                </span>
                <div>
                  <h3>{r.template.name}</h3>
                  <p>
                    {!r.missingCount
                      ? 'All the essentials are in your deck'
                      : `${r.missingCount} more component${r.missingCount === 1 ? '' : 's'} to get started`}
                  </p>
                </div>
                <span className={`readiness ${r.missingCount ? 'almost' : ''}`}>
                  {r.readiness}% ready
                </span>
                <ChevronRight size={16} />
              </Link>
            ))
          )}
          <div className="possible-foot">
            <span className="tiny-spark">✦</span>More in your deck. More possibilities.
          </div>
        </section>
      </div>
    </>
  );
}
