import { useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Plus,
  FolderKanban,
  ArrowUpRight,
  Pencil,
  Trash2,
  X,
  Package,
  Check,
  Sparkles,
} from 'lucide-react';
import type { InventoryItem, Project, Recommendation, Requirement } from '../../shared/types';
import { defaultCategories, projectStatuses } from '../../shared/types';
import { api, date, money, useResource } from '../api';
import { useApp } from '../context';
import { Badge, Empty, ErrorState, Field, Loading, Modal, PageHeading } from '../components/ui';
import { MatchDetails } from './Recommendations';
function ProjectForm({ project, onClose }: { project?: Project; onClose: () => void }) {
  const { refresh, notify } = useApp();
  const [requirements, setRequirements] = useState<Omit<Requirement, 'id'>[]>(
    project?.requirements || [],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const change = (idx: number, data: Partial<Requirement>) =>
    setRequirements((v) => v.map((r, i) => (idx === i ? { ...r, ...data } : r)));
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError('');
    try {
      await api(`/projects${project ? `/${project.id}` : ''}`, {
        method: project ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: f.get('name'),
          description: f.get('description'),
          status: f.get('status'),
          notes: f.get('notes'),
          estimatedCostCents: f.get('cost') ? Math.round(Number(f.get('cost')) * 100) : null,
          requirements,
        }),
      });
      refresh();
      notify(project ? 'Project updated.' : 'A new project, full of potential.');
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal title={project ? 'Edit project' : 'Start something good'} onClose={onClose} wide>
      <form onSubmit={submit}>
        <div className="form-body">
          <div className="form-grid">
            <Field label="Project name *" className="full">
              <input
                name="name"
                required
                maxLength={160}
                defaultValue={project?.name}
                autoFocus
                placeholder="e.g. My weekend NAS"
              />
            </Field>
            <Field label="Description" className="full">
              <textarea
                name="description"
                defaultValue={project?.description}
                maxLength={3000}
                rows={2}
                placeholder="What do you want to build?"
              />
            </Field>
            <Field label="Status">
              <select name="status" defaultValue={project?.status || 'Idea'}>
                {projectStatuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
            <Field label="Estimated additional cost ($)">
              <input
                name="cost"
                type="number"
                min="0"
                step="0.01"
                defaultValue={
                  project?.estimatedCostCents != null ? project.estimatedCostCents / 100 : ''
                }
              />
            </Field>
          </div>
          <div className="requirements-heading">
            <h3>Components to look for</h3>
            <button
              type="button"
              className="text-link"
              onClick={() =>
                setRequirements((v) => [
                  ...v,
                  {
                    name: '',
                    categories: ['Raspberry Pi'],
                    tags: [],
                    quantity: 1,
                    optional: false,
                    estimatedUnitCostCents: 0,
                  },
                ])
              }
            >
              <Plus size={15} />
              Add requirement
            </button>
          </div>
          <p className="muted small-text">
            Categories match any listed category; tags must all match. Add costs per unit for
            purchase estimates.
          </p>
          {requirements.map((r, idx) => (
            <div className="requirement-editor" key={idx}>
              <div className="requirement-editor-top">
                <strong>COMPONENT {idx + 1}</strong>
                <button
                  type="button"
                  className="icon-button"
                  aria-label={`Remove requirement ${idx + 1}`}
                  onClick={() => setRequirements((v) => v.filter((_, i) => i !== idx))}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="form-grid">
                <Field label="Requirement name">
                  <input
                    required
                    value={r.name}
                    onChange={(e) => change(idx, { name: e.target.value })}
                    placeholder="Boot storage"
                  />
                </Field>
                <Field label="Quantity">
                  <input
                    type="number"
                    required
                    min="1"
                    max="10000"
                    value={r.quantity}
                    onChange={(e) => change(idx, { quantity: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Categories (comma separated)">
                  <input
                    list="project-categories"
                    value={r.categories.join(', ')}
                    onChange={(e) =>
                      change(idx, { categories: e.target.value.split(',').map((v) => v.trim()) })
                    }
                    onBlur={() => change(idx, { categories: r.categories.filter(Boolean) })}
                  />
                </Field>
                <Field label="Tags (comma separated)">
                  <input
                    value={r.tags.join(', ')}
                    onChange={(e) =>
                      change(idx, {
                        tags: e.target.value.split(',').map((v) => v.trim().toLowerCase()),
                      })
                    }
                    onBlur={() => change(idx, { tags: r.tags.filter(Boolean) })}
                  />
                </Field>
                <Field label="Estimated cost per unit ($)">
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={r.estimatedUnitCostCents / 100}
                    onChange={(e) =>
                      change(idx, {
                        estimatedUnitCostCents: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </Field>
                <label className="checkbox-field">
                  <input
                    type="checkbox"
                    checked={r.optional}
                    onChange={(e) => change(idx, { optional: e.target.checked })}
                  />
                  Optional component
                </label>
              </div>
            </div>
          ))}
          <datalist id="project-categories">
            {defaultCategories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </datalist>
          <Field label="Notes" className="notes-field">
            <textarea
              name="notes"
              rows={3}
              maxLength={10000}
              defaultValue={project?.notes}
              placeholder="Ideas, setup steps, and things to remember…"
            />
          </Field>
          <p className="muted small-text">
            Completed projects keep their hardware in use. Abandoning a project releases its
            hardware.
          </p>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? 'Saving…' : project ? 'Save project' : 'Create project'}
            <Check size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ProjectDetail({ project, onClose }: { project: Project; onClose: () => void }) {
  const { refresh, revision, notify } = useApp();
  const [edit, setEdit] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [itemId, setItemId] = useState('');
  const [q, setQ] = useState('');
  const inventory = useResource<{ items: InventoryItem[] }>(
    `/inventory?status=Available&limit=100&q=${encodeURIComponent(q)}`,
    revision,
  );
  const compatibility = useResource<Recommendation>(
    `/projects/${project.id}/compatibility`,
    revision,
  );
  async function action(path: string, method: string, body?: object) {
    setBusy(true);
    setError('');
    try {
      await api(path, { method, ...(body ? { body: JSON.stringify(body) } : {}) });
      refresh();
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function assign(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    if (
      await action(`/projects/${project.id}/assignments`, 'POST', {
        itemId,
        quantity: Number(form.get('quantity')),
      })
    ) {
      notify('Hardware assigned to this project.');
      setItemId('');
    }
  }
  if (edit) return <ProjectForm project={project} onClose={() => setEdit(false)} />;
  return (
    <Modal title={project.name} onClose={onClose} wide>
      <div className="form-body">
        <div className="project-detail-meta">
          <Badge>{project.status}</Badge>
          <span>Created {date(project.createdAt)}</span>
          <span>
            {project.estimatedCostCents != null
              ? `${money(project.estimatedCostCents)} estimated`
              : 'No estimate yet'}
          </span>
        </div>
        <p className="form-intro">{project.description}</p>
        <div className="requirements-heading">
          <h3>Hardware in this project</h3>
          <span className="count-pill">
            {project.assignments.reduce((n, a) => n + a.quantity, 0)} UNITS
          </span>
        </div>
        {!project.assignments.length && (
          <p className="muted small-text">Assign hardware below to reserve it for this build.</p>
        )}
        {project.assignments.map((a) => (
          <div className="allocation-row" key={a.id}>
            <Package size={18} />
            <span>
              {a.itemName}
              <small>
                ×{a.quantity} ·{' '}
                {['In Progress', 'Complete'].includes(project.status) ? 'In use' : 'Reserved'}
              </small>
            </span>
            <button
              className="button ghost"
              disabled={busy}
              onClick={() => action(`/projects/${project.id}/assignments/${a.id}`, 'DELETE')}
            >
              Release
            </button>
          </div>
        ))}
        {project.status !== 'Abandoned' && (
          <form className="assign-form" onSubmit={assign}>
            <input
              aria-label="Search available hardware"
              placeholder="Search available hardware…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setItemId('');
              }}
            />
            <div>
              <select
                required
                aria-label="Hardware to assign"
                value={itemId}
                onChange={(e) => setItemId(e.target.value)}
              >
                <option value="">
                  {inventory.loading ? 'Loading…' : 'Choose available hardware'}
                </option>
                {inventory.data?.items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} ({i.availableQuantity} available)
                  </option>
                ))}
              </select>
              <input
                aria-label="Quantity to assign"
                name="quantity"
                type="number"
                defaultValue="1"
                min="1"
                max={
                  inventory.data?.items.find((i) => i.id === itemId)?.availableQuantity || 100000
                }
                required
              />
              <button className="button primary" disabled={busy || !itemId || inventory.loading}>
                <Plus size={16} />
                Assign
              </button>
            </div>
            {inventory.error && <p className="form-error">{inventory.error}</p>}
          </form>
        )}
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="requirements-heading">
          <h3>Build checklist</h3>
          <Sparkles size={16} />
        </div>
        {!project.requirements.length ? (
          <p className="muted small-text">
            Edit your project to add hardware requirements and check your deck.
          </p>
        ) : compatibility.loading ? (
          <Loading />
        ) : compatibility.error ? (
          <ErrorState message={compatibility.error} retry={compatibility.reload} />
        ) : (
          compatibility.data && <MatchDetails result={compatibility.data} />
        )}
        {project.notes && (
          <div className="detail-notes">
            <h4>Project notes</h4>
            <p>{project.notes}</p>
          </div>
        )}
        {confirm && (
          <div className="delete-confirm">
            <p>Delete this project? Its assigned hardware will be released.</p>
            <button
              className="button danger"
              disabled={busy}
              onClick={async () => {
                if (await action(`/projects/${project.id}`, 'DELETE')) {
                  notify('Project deleted and hardware released.');
                  onClose();
                }
              }}
            >
              Delete project
            </button>
            <button className="button ghost" onClick={() => setConfirm(false)}>
              Cancel
            </button>
          </div>
        )}
      </div>
      <div className="modal-footer split">
        <button className="button ghost danger-text" onClick={() => setConfirm(true)}>
          <Trash2 size={16} />
          Delete
        </button>
        <button className="button primary" onClick={() => setEdit(true)}>
          <Pencil size={16} />
          Edit project
        </button>
      </div>
    </Modal>
  );
}
export default function ProjectsPage() {
  const { revision } = useApp();
  const r = useResource<Project[]>('/projects', revision);
  const [create, setCreate] = useState(false);
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useState('All projects');
  const selected = r.data?.find((p) => p.id === params.get('project'));
  const projects = r.data?.filter((p) => filter === 'All projects' || p.status === filter);
  return (
    <>
      <PageHeading
        eyebrow="TURN YOUR PARTS INTO SOMETHING"
        title="Your projects"
        description="From a back-of-the-napkin idea to a build you’re proud of."
      >
        <Link className="button secondary" to="/build">
          <Sparkles size={16} />
          Find a build
        </Link>
        <button className="button primary" onClick={() => setCreate(true)}>
          <Plus size={16} />
          New project
        </button>
      </PageHeading>
      <div className="projects-filter">
        <span>{r.data?.length || 0} projects in the works</span>
        <select
          aria-label="Filter projects by status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option>All projects</option>
          {projectStatuses.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </div>
      {r.loading ? (
        <Loading />
      ) : r.error ? (
        <ErrorState message={r.error} retry={r.reload} />
      ) : !projects?.length ? (
        <Empty
          title="Make room for your next idea."
          action={
            <button className="button primary" onClick={() => setCreate(true)}>
              <Plus size={16} />
              Create a project
            </button>
          }
        >
          Start a project or explore what you can build with your deck.
        </Empty>
      ) : (
        <div className="projects-grid">
          {projects.map((p) => (
            <button
              key={p.id}
              className="project-card"
              onClick={() => setParams({ project: p.id })}
            >
              <div className="project-card-top">
                <span className="template-icon green">
                  <FolderKanban size={23} />
                </span>
                <Badge>{p.status}</Badge>
              </div>
              <h2>{p.name}</h2>
              <p>{p.description || 'A good idea, waiting to take shape.'}</p>
              <div className="project-card-stats">
                <span>
                  <Package size={14} />
                  {p.assignments.reduce((n, a) => n + a.quantity, 0)} assigned units
                </span>
                <span>{p.requirements.length} requirements</span>
              </div>
              <div className="project-card-footer">
                <span>{date(p.createdAt)}</span>
                <ArrowUpRight size={17} />
              </div>
            </button>
          ))}
        </div>
      )}
      {create && <ProjectForm onClose={() => setCreate(false)} />}
      {selected && <ProjectDetail project={selected} onClose={() => setParams({})} />}
    </>
  );
}
