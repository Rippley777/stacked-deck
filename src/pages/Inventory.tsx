import { ItemValuation } from '../components/Valuation';
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  Search,
  SlidersHorizontal,
  LayoutGrid,
  List,
  MapPin,
  Pencil,
  Archive,
  Trash2,
  ArrowLeft,
  ArrowRight,
  PackageOpen,
  ExternalLink,
} from 'lucide-react';
import type { InventoryItem, Location } from '../../shared/types';
import { itemStatuses } from '../../shared/types';
import { api, date, money, useResource } from '../api';
import { useApp } from '../context';
import {
  Badge,
  CategoryIcon,
  Empty,
  ErrorState,
  Loading,
  Modal,
  PageHeading,
} from '../components/ui';
import { HardwareArt } from '../components/HardwareArt';
import { ComputerSpecs, SystemParts } from '../components/SystemParts';
import { ItemForm } from '../components/ItemForm';
export function ItemDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { revision, refresh, notify } = useApp();
  const r = useResource<InventoryItem>(`/inventory/${id}`, revision);
  const [edit, setEdit] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function mutate(action: 'archive' | 'delete' | 'restore') {
    if (!r.data) return;
    setBusy(true);
    setError('');
    try {
      await api(`/inventory/${id}`, {
        method: action === 'delete' ? 'DELETE' : 'PUT',
        ...(action !== 'delete'
          ? {
              body: JSON.stringify({
                ...r.data,
                status: action === 'archive' ? 'Archived' : 'Available',
              }),
            }
          : {}),
      });
      refresh();
      notify(
        action === 'delete'
          ? 'Hardware deleted.'
          : action === 'archive'
            ? 'Hardware archived.'
            : 'Hardware restored.',
      );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (edit && r.data) return <ItemForm item={r.data} onClose={() => setEdit(false)} />;
  const i = r.data;
  return (
    <Modal title={i?.name || 'Hardware details'} onClose={onClose} wide={i?.kind === 'System'}>
      {r.loading ? (
        <Loading />
      ) : r.error || !i ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : (
        <>
          <div className="form-body">
            <div className="detail-art">
              {i.imageUrl ? (
                <img src={i.imageUrl} alt={i.name} referrerPolicy="no-referrer" />
              ) : (
                <HardwareArt category={i.category} />
              )}
              <Badge>{i.status}</Badge>
            </div>
            <dl className="details-grid">
              <div>
                <dt>Category</dt>
                <dd>{i.category}</dd>
              </div>
              <div>
                <dt>Quantity</dt>
                <dd>
                  {i.quantity} total · {i.availableQuantity} available
                </dd>
              </div>
              <div>
                <dt>Manufacturer / model</dt>
                <dd>{[i.manufacturer, i.model].filter(Boolean).join(' · ') || '—'}</dd>
              </div>
              <div>
                <dt>Location</dt>
                <dd>{i.locationName || 'Unassigned'}</dd>
              </div>
              <div>
                <dt>Condition</dt>
                <dd>{i.condition}</dd>
              </div>
              <div>
                <dt>
                  {i.kind === 'System' ? 'Purchase price of computer' : 'Purchase price per unit'}
                </dt>
                <dd>{i.purchasePriceCents == null ? '—' : money(i.purchasePriceCents, true)}</dd>
              </div>
              <div>
                <dt>Purchase date</dt>
                <dd>{i.purchaseDate ? date(i.purchaseDate) : '—'}</dd>
              </div>
              <div>
                <dt>Serial number</dt>
                <dd>{i.serialNumber || '—'}</dd>
              </div>
              <div>
                <dt>Added</dt>
                <dd>{date(i.createdAt)}</dd>
              </div>
            </dl>
            <ItemValuation item={i} />
            {i.kind === 'System' && (
              <>
                <ComputerSpecs item={i} />
                <SystemParts system={i} />
              </>
            )}
            {i.installedIn.length > 0 && (
              <div className="detail-notes">
                <h4>Installed in computers</h4>
                {i.installedIn.map((c) => (
                  <Link
                    key={c.id}
                    className="assignment-link"
                    to={`/systems?system=${c.systemId}`}
                    onClick={onClose}
                  >
                    {c.systemName}
                    <span>×{c.quantity} · Installed</span>
                    <ExternalLink size={13} />
                  </Link>
                ))}
              </div>
            )}
            {i.tags.length > 0 && (
              <div className="tags">
                {i.tags.map((t) => (
                  <span key={t}>#{t}</span>
                ))}
              </div>
            )}
            {i.notes && (
              <div className="detail-notes">
                <h4>Notes</h4>
                <p>{i.notes}</p>
              </div>
            )}
            {i.assignments.length > 0 && (
              <div className="detail-notes">
                <h4>Hardware in projects</h4>
                {i.assignments.map((a) => (
                  <Link
                    onClick={onClose}
                    className="assignment-link"
                    to={`/projects?project=${a.projectId}`}
                    key={a.id}
                  >
                    {a.projectName}
                    <span>
                      ×{a.quantity} ·{' '}
                      {['In Progress', 'Complete'].includes(a.projectStatus)
                        ? 'In use'
                        : 'Reserved'}
                    </span>
                    <ExternalLink size={13} />
                  </Link>
                ))}
              </div>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            {confirm && (
              <div className="delete-confirm">
                <p>
                  {i.kind === 'System'
                    ? 'Delete this computer? Linked parts will return to your available deck.'
                    : 'Delete this hardware permanently? This cannot be undone.'}
                </p>
                <button className="button danger" disabled={busy} onClick={() => mutate('delete')}>
                  Yes, delete hardware
                </button>
                <button className="button ghost" onClick={() => setConfirm(false)}>
                  Keep it
                </button>
              </div>
            )}
          </div>
          <div className="modal-footer split">
            <div>
              <button
                className="icon-button danger-text"
                aria-label="Delete hardware"
                title="Delete hardware"
                onClick={() => setConfirm(true)}
              >
                <Trash2 size={18} />
              </button>
              <button
                className="button ghost"
                disabled={busy}
                onClick={() => mutate(i.status === 'Archived' ? 'restore' : 'archive')}
              >
                <Archive size={16} />
                {i.status === 'Archived' ? 'Restore' : 'Archive'}
              </button>
            </div>
            <button className="button primary" onClick={() => setEdit(true)}>
              <Pencil size={16} />
              {i.kind === 'System' ? 'Edit computer' : 'Edit hardware'}
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
export default function InventoryPage() {
  const { revision, addItem } = useApp();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('q') || '');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [filters, setFilters] = useState(true);
  const [selected, setSelected] = useState(params.get('item') || '');
  useEffect(() => {
    setSearch(params.get('q') || '');
    if (params.get('item')) setSelected(params.get('item')!);
  }, [params]);
  const query = new URLSearchParams(params);
  query.delete('item');
  query.set('limit', '12');
  const r = useResource<{ items: InventoryItem[]; total: number; page: number; limit: number }>(
    `/inventory?${query}`,
    revision,
  );
  const meta = useResource<{ categories: string[]; locations: Location[] }>('/meta', revision);
  function filter(key: string, value: string) {
    const p = new URLSearchParams(params);
    p.delete('page');
    p.delete('item');
    if (value) p.set(key, value);
    else p.delete(key);
    setParams(p);
  }
  const activeFilters = ['category', 'status', 'locationId', 'tag', 'q'].some((k) => params.has(k));
  return (
    <>
      <PageHeading
        eyebrow="KNOW WHAT YOU HAVE"
        title="Your deck"
        description="Every board, drive, and little bit of possibility."
      >
        <Link className="button secondary" to="/systems?add=1">
          <Plus size={17} />
          Add computer
        </Link>
        <button className="button primary" onClick={addItem}>
          <Plus size={17} />
          Add hardware
        </button>
      </PageHeading>
      <div className="inventory-toolbar">
        <form
          className="search-field"
          onSubmit={(e) => {
            e.preventDefault();
            filter('q', search);
          }}
        >
          <Search size={17} />
          <input
            aria-label="Search inventory"
            placeholder="Search names, models, serial numbers, tags…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <button className="button ghost" type="submit">
            Search
          </button>
        </form>
        <button
          className={`button secondary filter-toggle ${filters ? 'selected' : ''}`}
          onClick={() => setFilters(!filters)}
        >
          <SlidersHorizontal size={16} />
          Filters
        </button>
        <div className="view-toggle">
          <button
            className={view === 'grid' ? 'selected' : ''}
            aria-label="Grid view"
            onClick={() => setView('grid')}
          >
            <LayoutGrid size={17} />
          </button>
          <button
            className={view === 'list' ? 'selected' : ''}
            aria-label="List view"
            onClick={() => setView('list')}
          >
            <List size={18} />
          </button>
        </div>
      </div>
      {filters && (
        <div className="filter-row">
          <select
            aria-label="Filter category"
            value={params.get('category') || ''}
            onChange={(e) => filter('category', e.target.value)}
          >
            <option value="">All categories</option>
            {meta.data?.categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            aria-label="Filter status"
            value={params.get('status') || ''}
            onChange={(e) => filter('status', e.target.value)}
          >
            <option value="">All active statuses</option>
            {itemStatuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <select
            aria-label="Filter location"
            value={params.get('locationId') || ''}
            onChange={(e) => filter('locationId', e.target.value)}
          >
            <option value="">All locations</option>
            {meta.data?.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
          <input
            aria-label="Filter tag"
            placeholder="Filter by tag…"
            value={params.get('tag') || ''}
            onChange={(e) => filter('tag', e.target.value)}
          />
          {activeFilters && (
            <button
              className="text-link"
              onClick={() => {
                setParams({});
                setSearch('');
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      )}
      <div className="results-label">
        <span>
          {r.data?.total ?? '—'} hardware cards
          {params.get('status') === 'Archived' ? ' in the archive' : ' in your deck'}
        </span>
        <span>RECENTLY ADDED FIRST</span>
      </div>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !r.data?.items.length ? (
        <Empty
          title={
            activeFilters ? 'No cards match this hand.' : 'An empty deck. Endless possibilities.'
          }
          action={
            <button
              className="button primary"
              onClick={
                activeFilters
                  ? () => {
                      setParams({});
                      setSearch('');
                    }
                  : addItem
              }
            >
              {activeFilters ? 'Clear filters' : 'Add your first hardware'}
            </button>
          }
        >
          {activeFilters
            ? 'Try a different search or loosen your filters.'
            : 'Start with the hardware you already have. Even the parts in that one drawer.'}
        </Empty>
      ) : view === 'grid' ? (
        <div className="inventory-grid">
          {r.data.items.map((i, idx) => (
            <button className="hardware-card" key={i.id} onClick={() => setSelected(i.id)}>
              <div className={`hardware-visual visual-${idx % 4}`}>
                <span className="category-label">{i.category}</span>
                <span className="card-suit">{['♠', '♧', '◇', '♣'][idx % 4]}</span>
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
                  <Badge
                    tone={
                      i.availableQuantity ? 'available' : i.assignments.length ? 'reserved' : ''
                    }
                  >
                    {i.availableQuantity
                      ? `${i.availableQuantity} available`
                      : i.installedIn.length
                        ? 'Installed'
                        : i.assignments.length
                          ? 'In a project'
                          : i.status}
                  </Badge>
                  <span>{i.estimatedValueCents != null ? money(i.estimatedValueCents) : '—'}</span>
                </div>
                {i.installedIn.length > 0 && (
                  <p className="card-assignment">
                    <PackageOpen size={12} />
                    {i.installedIn.map((c) => c.systemName).join(', ')}
                  </p>
                )}
                {i.assignments.length > 0 && (
                  <p className="card-assignment">
                    <PackageOpen size={12} />
                    {i.assignments.map((a) => a.projectName).join(', ')}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Hardware</th>
                <th>Category</th>
                <th>Location</th>
                <th>Quantity</th>
                <th>Available</th>
                <th>Value / unit</th>
              </tr>
            </thead>
            <tbody>
              {r.data.items.map((i) => (
                <tr key={i.id}>
                  <td>
                    <button className="table-item" onClick={() => setSelected(i.id)}>
                      <CategoryIcon category={i.category} />
                      <span>
                        {i.name}
                        <small>{i.manufacturer}</small>
                      </span>
                    </button>
                  </td>
                  <td>{i.category}</td>
                  <td>{i.locationName || '—'}</td>
                  <td>{i.quantity}</td>
                  <td>
                    <Badge tone={i.availableQuantity ? 'available' : 'reserved'}>
                      {i.availableQuantity}
                    </Badge>
                  </td>
                  <td>{i.estimatedValueCents != null ? money(i.estimatedValueCents) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {r.data && r.data.total > r.data.limit && (
        <div className="pagination">
          <span>
            Page {r.data.page} of {Math.ceil(r.data.total / r.data.limit)}
          </span>
          <button
            className="button secondary"
            disabled={r.data.page <= 1}
            onClick={() => {
              const p = new URLSearchParams(params);
              p.set('page', String(r.data!.page - 1));
              setParams(p);
            }}
          >
            <ArrowLeft size={15} />
            Previous
          </button>
          <button
            className="button secondary"
            disabled={r.data.page * r.data.limit >= r.data.total}
            onClick={() => {
              const p = new URLSearchParams(params);
              p.set('page', String(r.data!.page + 1));
              setParams(p);
            }}
          >
            Next
            <ArrowRight size={15} />
          </button>
        </div>
      )}
      {selected && (
        <ItemDetail
          id={selected}
          onClose={() => {
            setSelected('');
            if (params.has('item')) {
              const p = new URLSearchParams(params);
              p.delete('item');
              setParams(p, { replace: true });
            }
          }}
        />
      )}
    </>
  );
}
