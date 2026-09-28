import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Plus, MapPin, ArrowUpRight, Pencil, Trash2 } from 'lucide-react';
import type { Location } from '../../shared/types';
import { api, useResource } from '../api';
import { useApp } from '../context';
import { Empty, ErrorState, Field, Loading, Modal, PageHeading } from '../components/ui';
export default function LocationsPage() {
  const { revision, refresh, notify } = useApp();
  const r = useResource<Location[]>('/locations', revision);
  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  const [deleting, setDeleting] = useState<Location | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(`/locations${editing && editing !== 'new' ? `/${editing.id}` : ''}`, {
        method: editing === 'new' ? 'POST' : 'PUT',
        body: JSON.stringify(Object.fromEntries(form)),
      });
      refresh();
      notify('Location saved. Everything in its place.');
      setEditing(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    if (!deleting) return;
    setBusy(true);
    setError('');
    try {
      await api(`/locations/${deleting.id}`, { method: 'DELETE' });
      refresh();
      setDeleting(null);
      notify('Location removed. Your hardware is still in your deck.');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const current = editing && editing !== 'new' ? editing : undefined;
  return (
    <>
      <PageHeading
        eyebrow="NO MORE “WHERE DID I PUT THAT?”"
        title="A place for every part"
        description="From your server rack to that drawer of very important cables."
      >
        <button
          className="button primary"
          onClick={() => {
            setEditing('new');
            setError('');
          }}
        >
          <Plus size={16} />
          Add location
        </button>
      </PageHeading>
      <div className="location-tip">
        <MapPin size={20} />
        <p>
          Keep it simple, or get specific. <strong>Office → Shelf → Bin 3</strong> works
          beautifully.
        </p>
      </div>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !r.data?.length ? (
        <Empty
          title="Everything needs a home."
          action={
            <button className="button primary" onClick={() => setEditing('new')}>
              Add your first location
            </button>
          }
        >
          Create a location, then use it when adding or editing hardware.
        </Empty>
      ) : (
        <div className="locations-grid">
          {r.data.map((l) => (
            <article className="location-card" key={l.id}>
              <span className="template-icon green">
                <MapPin size={23} />
              </span>
              <h2>{l.name}</h2>
              <p>{l.description || 'A home for your hardware.'}</p>
              <div className="location-card-bottom">
                <Link className="text-link" to={`/deck?locationId=${l.id}`}>
                  {l.itemCount} hardware cards
                  <ArrowUpRight size={15} />
                </Link>
                <div>
                  <button
                    className="icon-button"
                    aria-label={`Edit ${l.name}`}
                    onClick={() => {
                      setEditing(l);
                      setError('');
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label={`Delete ${l.name}`}
                    onClick={() => {
                      setDeleting(l);
                      setError('');
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && (
        <Modal
          title={current ? 'Edit location' : 'Make a little space'}
          onClose={() => setEditing(null)}
        >
          <form onSubmit={submit}>
            <div className="form-body">
              <Field label="Location name *" hint="Use → to describe a shelf, drawer, or bin.">
                <input
                  name="name"
                  required
                  autoFocus
                  maxLength={160}
                  defaultValue={current?.name}
                  placeholder="Office → Shelf → Bin 3"
                />
              </Field>
              <Field label="Description" className="notes-field">
                <textarea
                  name="description"
                  rows={3}
                  maxLength={500}
                  defaultValue={current?.description}
                  placeholder="What goes here?"
                />
              </Field>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </div>
            <div className="modal-footer">
              <button className="button secondary" type="button" onClick={() => setEditing(null)}>
                Cancel
              </button>
              <button className="button primary" disabled={busy}>
                {busy ? 'Saving…' : 'Save location'}
              </button>
            </div>
          </form>
        </Modal>
      )}
      {deleting && (
        <Modal title="Remove this location?" onClose={() => setDeleting(null)}>
          <div className="form-body">
            <p>
              Remove <strong>{deleting.name}</strong>? Its hardware will stay in your deck with no
              location assigned.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
          </div>
          <div className="modal-footer">
            <button className="button secondary" onClick={() => setDeleting(null)}>
              Keep it
            </button>
            <button className="button danger" disabled={busy} onClick={remove}>
              {busy ? 'Removing…' : 'Remove location'}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
