import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus, Search, MapPin, ArrowUpRight, ArrowLeft, ArrowRight, Monitor } from 'lucide-react';
import type { InventoryItem } from '../../shared/types';
import { itemStatuses, systemCategories } from '../../shared/types';
import { money, useResource } from '../api';
import { useApp } from '../context';
import { Badge, Empty, ErrorState, Loading, PageHeading } from '../components/ui';
import { HardwareArt } from '../components/HardwareArt';
import { ItemForm } from '../components/ItemForm';
import { ItemDetail } from './Inventory';
export default function SystemsPage() {
  const { revision } = useApp();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({
    kind: 'System',
    limit: '12',
    page: String(page),
    q,
    category,
    status,
  });
  const r = useResource<{ items: InventoryItem[]; total: number; limit: number; page: number }>(
    `/inventory?${query}`,
    revision,
  );
  const selected = params.get('system');
  const create = params.get('add') === '1';
  function searchSystems(e: FormEvent) {
    e.preventDefault();
    setPage(1);
    setQ(search);
  }
  return (
    <>
      <PageHeading
        eyebrow="THE MACHINES YOU OWN"
        title="Your computers"
        description="Complete systems, custom builds, and the parts that make them yours."
      >
        <Link to="/deck" className="button secondary">
          View all hardware
        </Link>
        <button className="button primary" onClick={() => setParams({ add: '1' })}>
          <Plus size={17} />
          Add computer
        </button>
      </PageHeading>
      <div className="systems-toolbar">
        <form className="search-field" onSubmit={searchSystems}>
          <Search size={17} />
          <input
            aria-label="Search computers"
            placeholder="Search computers, processors, graphics, serial numbers…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="button ghost">Search</button>
        </form>
        <select
          aria-label="Filter computer type"
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All computer types</option>
          {systemCategories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <select
          aria-label="Filter computer status"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All except archived</option>
          {itemStatuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      <p className="muted small-text systems-count">
        {r.data?.total ?? 0} {r.data?.total === 1 ? 'computer' : 'computers'} · Catalog each machine
        separately to keep its specifications and parts together.
      </p>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !r.data?.items.length ? (
        <Empty
          title={
            q || category || status
              ? 'No computers match these filters.'
              : 'Give your computers a home.'
          }
          action={
            <button className="button primary" onClick={() => setParams({ add: '1' })}>
              <Plus size={16} />
              Add computer
            </button>
          }
        >
          Add a prebuilt laptop, a desktop you assembled, or a server in your rack. Specifications
          and linked parts are optional.
        </Empty>
      ) : (
        <div className="inventory-grid systems-grid">
          {r.data.items.map((i) => (
            <button
              key={i.id}
              className="hardware-card system-card"
              onClick={() => setParams({ system: i.id })}
            >
              <div className="hardware-visual visual-1">
                <span className="category-label">{i.category}</span>
                <span className="card-suit">
                  <Monitor size={17} />
                </span>
                {i.imageUrl ? (
                  <img src={i.imageUrl} alt={i.name} referrerPolicy="no-referrer" />
                ) : (
                  <HardwareArt category={i.category} />
                )}
              </div>
              <div className="hardware-info">
                <div className="system-card-title">
                  <h2>{i.name}</h2>
                  <ArrowUpRight size={17} />
                </div>
                <span className="hardware-location">
                  <MapPin size={12} />
                  {i.locationName || 'No location yet'}
                </span>
                <dl className="system-card-specs">
                  <div>
                    <dt>CPU</dt>
                    <dd>{i.systemSpecs?.processor || 'Not recorded'}</dd>
                  </div>
                  <div>
                    <dt>RAM</dt>
                    <dd>
                      {i.systemSpecs?.memoryGB ? `${i.systemSpecs.memoryGB} GB` : 'Not recorded'}
                    </dd>
                  </div>
                  <div>
                    <dt>GPU</dt>
                    <dd>{i.systemSpecs?.graphics || 'Not recorded'}</dd>
                  </div>
                </dl>
                <div className="hardware-card-bottom">
                  <Badge>{i.assignments.length ? 'In a project' : i.status}</Badge>
                  <span>
                    {i.estimatedValueCents !== null
                      ? money(i.estimatedValueCents)
                      : 'Value not set'}
                  </span>
                </div>
                <p className="card-assignment">
                  {i.systemSpecs?.buildType} · {i.components.reduce((n, c) => n + c.quantity, 0)}{' '}
                  linked {i.components.reduce((n, c) => n + c.quantity, 0) === 1 ? 'part' : 'parts'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
      {r.data && r.data.total > r.data.limit && (
        <div className="pagination">
          <span>
            Page {page} of {Math.ceil(r.data.total / r.data.limit)}
          </span>
          <button
            className="button secondary"
            disabled={page <= 1}
            onClick={() => setPage((v) => v - 1)}
          >
            <ArrowLeft size={15} />
            Previous
          </button>
          <button
            className="button secondary"
            disabled={page * r.data.limit >= r.data.total}
            onClick={() => setPage((v) => v + 1)}
          >
            Next
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      {create && (
        <ItemForm
          system
          onClose={() => setParams({})}
          onSaved={(item) => setParams({ system: item.id })}
        />
      )}
      {selected && <ItemDetail id={selected} onClose={() => setParams({})} />}
    </>
  );
}
