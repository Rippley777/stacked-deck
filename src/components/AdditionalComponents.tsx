import type { Dispatch, SetStateAction } from 'react';
import { Trash2 } from 'lucide-react';
import type { Location } from '../../shared/types';
import { ItemFields } from './ItemFields';

export interface ComponentDraft {
  id: string;
  active: boolean;
}

export function AdditionalComponents({
  components,
  setComponents,
  meta,
  busy,
}: {
  components: ComponentDraft[];
  setComponents: Dispatch<SetStateAction<ComponentDraft[]>>;
  meta: { categories: string[]; locations: Location[] };
  busy: boolean;
}) {
  return (
    <section aria-label="Installed components">
      <div className="system-form-heading">
        <h3>Installed components</h3>
        <p className="muted small-text">
          Add the parts inside this computer. Enter a component name to reveal another input below.
          All quantities entered here will be installed in this computer; leave the last input blank
          when you’re done.
        </p>
      </div>
      {components.map((component, index) => (
        <section
          className="additional-component"
          key={component.id}
          aria-label={`Component ${index + 1}`}
        >
          <div className="requirements-heading">
            <h3>
              {component.active
                ? `Component ${index + 1}`
                : index === 0
                  ? 'Add a component'
                  : 'Add another component'}
            </h3>
            {component.active && (
              <button
                type="button"
                className="button ghost"
                disabled={busy}
                onClick={() =>
                  setComponents((rows) => rows.filter((row) => row.id !== component.id))
                }
                aria-label={`Remove component ${index + 1}`}
              >
                <Trash2 size={16} /> Remove
              </button>
            )}
          </div>
          {!component.active && (
            <p className="muted small-text">Optional. Enter a name to add its details.</p>
          )}
          <ItemFields
            isSystem={false}
            installed
            meta={meta}
            prefix={`${component.id}-`}
            nameLabel={`Component ${index + 1} name`}
            showDetails={component.active}
            onNameChange={(name) => {
              if (!component.active && name.trim())
                setComponents((rows) => [
                  ...rows.map((row) => (row.id === component.id ? { ...row, active: true } : row)),
                  { id: crypto.randomUUID(), active: false },
                ]);
            }}
          />
        </section>
      ))}
    </section>
  );
}
