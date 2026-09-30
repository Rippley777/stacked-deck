import { useState } from 'react';
import { connectors, type Connectivity, type Endpoint } from '../../shared/connectivity';
import { Field } from './ui';

type Spec = [string, string, 'number' | 'boolean' | 'text' | readonly string[]];
const electrical: Spec[] = [
  ['voltage', 'Voltage (V)', 'number'],
  ['current', 'Current (A)', 'number'],
  ['wattage', 'Wattage (W)', 'number'],
  ['acDc', 'AC or DC', ['AC', 'DC']],
  ['polarity', 'Polarity', ['center_positive', 'center_negative']],
  ['pd', 'USB Power Delivery', 'boolean'],
  ['proprietaryProtocol', 'Proprietary protocol (enter none if verified)', 'text'],
];
const capabilities: Spec[] = [
  ['standard', 'Connector standard', 'text'],
  ['usbVersion', 'USB version', 'text'],
  ['thunderboltVersion', 'Thunderbolt version', 'text'],
  ['displayStandard', 'Display standard', 'text'],
  ['maxDataGbps', 'Data rate (Gbps)', 'number'],
  ['maxPowerW', 'Power rating / target (W)', 'number'],
  ['supportsPd', 'Supports USB-PD', 'boolean'],
  ['supportsVideo', 'Supports video', 'boolean'],
  ['supportsData', 'Supports data', 'boolean'],
  ['supportsCharging', 'Supports charging', 'boolean'],
  ['supportsAltMode', 'DisplayPort Alt Mode', 'boolean'],
];
function Fields({
  value,
  onChange,
  specs,
}: {
  value: object;
  onChange: (value: Record<string, unknown>) => void;
  specs: Spec[];
}) {
  const record = value as Record<string, unknown>;
  return (
    <div className="form-grid">
      {specs.map(([key, label, type]) => (
        <Field key={key} label={label}>
          {type === 'boolean' || Array.isArray(type) ? (
            <select
              value={record[key] === undefined ? '' : String(record[key])}
              onChange={(e) =>
                onChange({
                  ...record,
                  [key]:
                    e.target.value === ''
                      ? undefined
                      : type === 'boolean'
                        ? e.target.value === 'true'
                        : e.target.value,
                })
              }
            >
              <option value="">Unknown</option>
              {(type === 'boolean' ? ['true', 'false'] : (type as readonly string[])).map((v) => (
                <option value={v} key={v}>
                  {v === 'true' ? 'Yes' : v === 'false' ? 'No' : v.replaceAll('_', ' ')}
                </option>
              ))}
            </select>
          ) : (
            <input
              type={type === 'number' ? 'number' : 'text'}
              min={type === 'number' ? '0.001' : undefined}
              max={type === 'number' ? '1000000' : undefined}
              step="any"
              maxLength={160}
              value={String(record[key] ?? '')}
              placeholder="Unknown"
              onChange={(e) =>
                onChange({
                  ...record,
                  [key]:
                    e.target.value === ''
                      ? undefined
                      : type === 'number'
                        ? Number(e.target.value)
                        : e.target.value,
                })
              }
            />
          )}
        </Field>
      ))}
    </div>
  );
}
function Connector({
  label,
  value = {},
  onChange,
}: {
  label: string;
  value?: Endpoint;
  onChange: (value: Endpoint) => void;
}) {
  return (
    <fieldset className="connector-fields">
      <legend>{label}</legend>
      <div className="form-grid">
        <Field label="Connector">
          <select
            value={value.connector || ''}
            onChange={(e) => onChange({ ...value, connector: e.target.value || undefined })}
          >
            <option value="">Unknown</option>
            {[
              ...connectors,
              ...(value.connector && !connectors.some((c) => c === value.connector)
                ? [value.connector]
                : []),
            ].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label="Connector gender">
          <select
            value={value.gender || ''}
            onChange={(e) =>
              onChange({ ...value, gender: (e.target.value as Endpoint['gender']) || undefined })
            }
          >
            <option value="">Unknown</option>
            <option value="male">Male / plug</option>
            <option value="female">Female / socket</option>
          </select>
        </Field>
      </div>
      {value.connector === 'DC barrel' && (
        <Fields
          value={value}
          onChange={onChange}
          specs={[
            ['outerMm', 'Barrel outer diameter (mm)', 'number'],
            ['innerMm', 'Barrel inner diameter (mm)', 'number'],
          ]}
        />
      )}
    </fieldset>
  );
}
function Rows({
  label,
  value = [],
  columns,
  onChange,
}: {
  label: string;
  value?: object[];
  columns: Spec[];
  onChange: (v: Record<string, unknown>[]) => void;
}) {
  return (
    <div className="spec-rows">
      <h4>{label}</h4>
      {value.map((row, index) => (
        <div className="spec-row" key={index}>
          <Fields
            value={row}
            specs={columns}
            onChange={(next) =>
              onChange(value.map((v, i) => (i === index ? next : v)) as Record<string, unknown>[])
            }
          />
          <button
            type="button"
            className="text-link"
            onClick={() =>
              onChange(value.filter((_, i) => i !== index) as Record<string, unknown>[])
            }
          >
            Remove {label.toLowerCase()} {index + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        className="button secondary"
        onClick={() => onChange([...value, {}] as Record<string, unknown>[])}
      >
        Add {label.toLowerCase()}
      </button>
    </div>
  );
}
export function ConnectivityFields({
  initial,
  prefix = '',
}: {
  initial?: Connectivity | null;
  prefix?: string;
}) {
  const [value, setValue] = useState<Connectivity>(initial || { version: 1 });
  const update = (next: Partial<Connectivity>) =>
    setValue((v) => ({ ...v, ...next, verified: false }));
  const active = Boolean(value.cable || value.adapter || value.power || value.connections?.length);
  const cable = value.cable;
  return (
    <details className="connectivity-editor full" open={active || undefined}>
      <summary>Cables, power & connections</summary>
      <p className="muted small-text">
        Add only specifications you can verify. Blank means unknown. Adapter current is its
        capacity; device current and wattage are minimum requirements.
      </p>
      <input
        type="hidden"
        name={`${prefix}connectivity`}
        value={JSON.stringify(active ? value : null)}
      />
      <div className="scan-actions">
        {!cable && (
          <button
            type="button"
            className="button secondary"
            onClick={() => update({ cable: { family: 'usb' }, adapter: undefined })}
          >
            Describe a cable
          </button>
        )}
        {!value.adapter && (
          <button
            type="button"
            className="button secondary"
            onClick={() => update({ adapter: {}, cable: undefined })}
          >
            Describe a charger
          </button>
        )}
        {!value.power && (
          <button type="button" className="button secondary" onClick={() => update({ power: {} })}>
            Add device power requirements
          </button>
        )}
      </div>
      {cable && (
        <section className="spec-section">
          <h3>Cable specifications</h3>
          <Fields
            value={cable}
            onChange={(next) => update({ cable: next })}
            specs={[
              ['family', 'Cable family', ['usb', 'video', 'network', 'audio', 'power', 'other']],
              ['lengthM', 'Cable length (meters)', 'number'],
              ['directional', 'Directional (A → B only)', 'boolean'],
              ['active', 'Active electronics', 'boolean'],
              ['certification', 'Certification', 'text'],
            ]}
          />
          <Connector
            label="Connector A"
            value={cable.a}
            onChange={(a) => update({ cable: { ...cable, a } })}
          />
          <Connector
            label="Connector B"
            value={cable.b}
            onChange={(b) => update({ cable: { ...cable, b } })}
          />
          <Fields
            value={cable}
            onChange={(next) => update({ cable: next })}
            specs={capabilities.filter(([key]) => {
              if (
                [
                  'usbVersion',
                  'thunderboltVersion',
                  'supportsPd',
                  'supportsAltMode',
                  'supportsCharging',
                  'maxPowerW',
                ].includes(key)
              )
                return cable.family === 'usb';
              if (['supportsVideo', 'displayStandard'].includes(key))
                return ['usb', 'video'].includes(cable.family || '');
              return !['audio', 'power'].includes(cable.family || '');
            })}
          />
          {cable.family === 'network' && (
            <Fields
              value={cable}
              onChange={(next) => update({ cable: next })}
              specs={[['ethernetCategory', 'Ethernet category', 'text']]}
            />
          )}
          {cable.family === 'power' && (
            <Fields
              value={cable}
              onChange={(next) => update({ cable: next })}
              specs={[
                ['maxVoltage', 'Rated voltage (V)', 'number'],
                ['maxCurrent', 'Rated current (A)', 'number'],
              ]}
            />
          )}
          {['usb', 'video'].includes(cable.family || '') && (
            <Rows
              label="Video modes"
              value={cable.videoModes}
              columns={videoColumns}
              onChange={(modes) =>
                update({
                  cable: {
                    ...cable,
                    videoModes: modes as NonNullable<Connectivity['cable']>['videoModes'],
                  },
                })
              }
            />
          )}
          <button type="button" className="text-link" onClick={() => update({ cable: undefined })}>
            Remove cable specifications
          </button>
        </section>
      )}
      {(['adapter', 'power'] as const).map((kind) => {
        const spec = value[kind];
        if (!spec) return null;
        return (
          <section className="spec-section" key={kind}>
            <h3>{kind === 'adapter' ? 'Charger output' : 'Device power requirements'}</h3>
            <Connector
              label="Power connector"
              value={spec.connector}
              onChange={(connector) => update({ [kind]: { ...spec, connector } })}
            />
            <Fields
              value={spec}
              onChange={(next) => update({ [kind]: next })}
              specs={electrical.filter(
                ([key]) =>
                  key !== 'polarity' ||
                  spec.connector?.connector === 'DC barrel' ||
                  spec.connector?.connector === 'Proprietary',
              )}
            />
            {spec.acDc === 'AC' && (
              <Fields
                value={spec}
                onChange={(next) => update({ [kind]: next })}
                specs={[['frequencyHz', 'Output / required frequency (Hz)', 'number']]}
              />
            )}
            {kind === 'adapter' ? (
              <Fields
                value={spec}
                onChange={(next) => update({ adapter: next })}
                specs={[
                  ['outputMode', 'Output mode', ['fixed', 'variable']],
                  ['ports', 'Number of charging ports', 'number'],
                  ['perPortW', 'Available watts on this port', 'number'],
                  ['inputVoltage', 'Mains input voltage (label)', 'text'],
                  ['inputFrequency', 'Mains input frequency (label)', 'text'],
                  ['inputCurrent', 'Mains input current (A)', 'number'],
                  ['quickCharge', 'Quick Charge protocol', 'text'],
                  ['gan', 'GaN', 'boolean'],
                ]}
              />
            ) : (
              <Fields
                value={spec}
                onChange={(next) => update({ power: next })}
                specs={[
                  ['recommendedW', 'Recommended charging wattage (W)', 'number'],
                  ['includedAdapterModel', 'Original adapter model', 'text'],
                ]}
              />
            )}
            {spec.pd && (
              <Rows
                label="PD profiles"
                value={spec.pdProfiles}
                columns={[
                  ['voltage', 'Profile voltage (V)', 'number'],
                  ['current', 'Profile current (A)', 'number'],
                ]}
                onChange={(pdProfiles) => update({ [kind]: { ...spec, pdProfiles } })}
              />
            )}
            <button
              type="button"
              className="text-link"
              onClick={() => update({ [kind]: undefined })}
            >
              Remove {kind === 'adapter' ? 'charger output' : 'power requirements'}
            </button>
          </section>
        );
      })}
      <section className="spec-section">
        <h3>Device connections</h3>
        <p className="muted small-text">
          Describe each port and the performance you need. Separate ports are alternatives, not
          cumulative requirements.
        </p>
        {value.connections?.map((connection, index) => {
          const set = (next: object) =>
            update({
              connections: value.connections!.map((c, i) =>
                i === index ? (next as typeof connection) : c,
              ),
            });
          return (
            <div className="spec-row" key={index}>
              <Fields
                value={connection}
                onChange={set}
                specs={[
                  ['label', 'Connection name', 'text'],
                  [
                    'purpose',
                    'Purpose',
                    ['video', 'data', 'network', 'audio', 'charging', 'power'],
                  ],
                  ['role', 'Device signal direction', ['input', 'output', 'bidirectional']],
                  ['count', 'Port count', 'number'],
                ]}
              />
              <Connector
                label="Device port"
                value={connection.port}
                onChange={(port) => set({ ...connection, port })}
              />
              <details>
                <summary>Other endpoint (optional)</summary>
                <Connector
                  label="Other device port"
                  value={connection.sourcePort}
                  onChange={(sourcePort) => set({ ...connection, sourcePort })}
                />
              </details>
              <Fields
                value={connection}
                onChange={set}
                specs={capabilities.filter(([k]) =>
                  [
                    'standard',
                    'maxDataGbps',
                    'maxPowerW',
                    'supportsPd',
                    'supportsAltMode',
                  ].includes(k),
                )}
              />
              {connection.purpose === 'video' && (
                <Rows
                  label="Required video modes"
                  value={connection.videoModes}
                  columns={videoColumns}
                  onChange={(videoModes) => set({ ...connection, videoModes })}
                />
              )}
              <button
                type="button"
                className="text-link"
                onClick={() =>
                  update({ connections: value.connections!.filter((_, i) => i !== index) })
                }
              >
                Remove connection {index + 1}
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="button secondary"
          onClick={() =>
            update({ connections: [...(value.connections || []), { purpose: 'video', port: {} }] })
          }
        >
          Add connection
        </button>
      </section>
      {active && (
        <>
          <Field label="Specification evidence">
            <textarea
              rows={2}
              maxLength={1500}
              placeholder="Readable label or manufacturer documentation used to verify these specifications"
              value={value.evidence || ''}
              onChange={(e) => update({ evidence: e.target.value })}
            />
          </Field>
          <label className="check-label">
            <input
              type="checkbox"
              checked={value.verified === true}
              onChange={(e) => setValue((v) => ({ ...v, verified: e.target.checked }))}
            />
            I checked these specifications against labels or manufacturer documentation.
          </label>
        </>
      )}
    </details>
  );
}
const videoColumns: Spec[] = [
  ['width', 'Width (pixels)', 'number'],
  ['height', 'Height (pixels)', 'number'],
  ['hz', 'Refresh rate (Hz)', 'number'],
  ['note', 'Color / compression conditions', 'text'],
];
