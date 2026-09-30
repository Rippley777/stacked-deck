import { ConnectivityFields } from './ConnectivityFields';
import type { Connectivity } from '../../shared/connectivity';
import type { InventoryItem, Location } from '../../shared/types';
import { buildTypes, conditions, itemStatuses, systemCategories } from '../../shared/types';
import { Field } from './ui';

export function ItemFields({
  item,
  isSystem,
  meta,
  prefix = '',
  nameLabel = 'Name *',
  autoFocus = false,
  onNameChange,
  showDetails = true,
  installed = false,
  connectivityOverride,
}: {
  item?: Partial<InventoryItem>;
  isSystem: boolean;
  meta: { categories: string[]; locations: Location[] };
  prefix?: string;
  nameLabel?: string;
  autoFocus?: boolean;
  onNameChange?: (name: string) => void;
  showDetails?: boolean;
  installed?: boolean;
  connectivityOverride?: Connectivity | null;
}) {
  return (
    <div className="form-grid">
      <Field label={nameLabel} className="full">
        <input
          name={`${prefix}name`}
          required={showDetails}
          maxLength={160}
          defaultValue={item?.name}
          onChange={onNameChange ? (e) => onNameChange(e.target.value) : undefined}
          placeholder={isSystem ? 'e.g. Living room gaming PC' : 'e.g. Raspberry Pi 4 · 8GB'}
          autoFocus={autoFocus}
        />
      </Field>
      {showDetails && (
        <>
          {isSystem ? (
            <>
              <Field label="Computer type *">
                <select
                  name={`${prefix}category`}
                  defaultValue={item?.category || 'Desktop Computer'}
                >
                  {systemCategories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </Field>
              <Field label="Build origin">
                <select
                  name={`${prefix}buildType`}
                  defaultValue={item?.systemSpecs?.buildType || 'Prebuilt'}
                >
                  {buildTypes.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </Field>
              <input name={`${prefix}quantity`} type="hidden" value="1" />
            </>
          ) : (
            <>
              <Field label="Category *" hint="Choose a category or type your own.">
                <input
                  name={`${prefix}category`}
                  required
                  list={`${prefix}categories`}
                  defaultValue={item?.category || (installed ? '' : 'Raspberry Pi')}
                  maxLength={160}
                />
                <datalist id={`${prefix}categories`}>
                  {meta.categories.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
              </Field>
              <Field label={installed ? 'Quantity installed *' : 'Quantity *'}>
                <input
                  name={`${prefix}quantity`}
                  type="number"
                  min="1"
                  max="100000"
                  required
                  defaultValue={item?.quantity || 1}
                />
              </Field>
            </>
          )}
          <Field label="Manufacturer">
            <input
              name={`${prefix}manufacturer`}
              defaultValue={item?.manufacturer}
              maxLength={160}
              placeholder="e.g. NVIDIA"
            />
          </Field>
          <Field label="Model">
            <input
              name={`${prefix}model`}
              defaultValue={item?.model}
              maxLength={160}
              placeholder="e.g. RTX 3070 Ti"
            />
          </Field>
          <Field label="Condition">
            <select name={`${prefix}condition`} defaultValue={item?.condition || 'Good'}>
              {conditions.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </Field>
          {installed ? (
            <input type="hidden" name={`${prefix}status`} value="Available" />
          ) : (
            <Field
              label="Base status"
              hint={
                item?.assignments?.length
                  ? 'Assignments control reserved and in-use units.'
                  : undefined
              }
            >
              <select
                name={`${prefix}status`}
                defaultValue={item?.status || (isSystem ? 'In Use' : 'Available')}
              >
                {itemStatuses.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Location">
            <select name={`${prefix}locationId`} defaultValue={item?.locationId || ''}>
              <option value="">No location yet</option>
              {meta.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Tags" hint="Separate tags with commas.">
            <input
              name={`${prefix}tags`}
              defaultValue={item?.tags?.join(', ')}
              placeholder="homelab, arm64, spare"
            />
          </Field>
          <Field
            label={isSystem ? 'Current value of computer ($)' : 'Current value per unit ($)'}
            hint={
              isSystem
                ? 'Includes linked parts. Leave blank to use their combined value.'
                : 'A manual value takes priority over AI estimates. Leave blank to use an accepted AI estimate.'
            }
          >
            <input
              name={`${prefix}estimatedValue`}
              type="number"
              step="0.01"
              min="0"
              defaultValue={item?.estimatedValueCents != null ? item.estimatedValueCents / 100 : ''}
            />
          </Field>
          <Field
            label={isSystem ? 'Purchase price of computer ($)' : 'Purchase price per unit ($)'}
          >
            <input
              name={`${prefix}purchasePrice`}
              type="number"
              step="0.01"
              min="0"
              defaultValue={item?.purchasePriceCents != null ? item.purchasePriceCents / 100 : ''}
            />
          </Field>
          <Field label="Purchase date">
            <input
              name={`${prefix}purchaseDate`}
              type="date"
              defaultValue={item?.purchaseDate || ''}
            />
          </Field>
          <Field label="Serial number">
            <input
              name={`${prefix}serialNumber`}
              defaultValue={item?.serialNumber}
              maxLength={160}
            />
          </Field>
          <Field label="Photo URL" className="full">
            <input
              name={`${prefix}imageUrl`}
              type="url"
              defaultValue={item?.imageUrl}
              placeholder="https://…"
            />
          </Field>
          {isSystem && (
            <>
              <div className="full system-form-heading">
                <h3>Computer specifications</h3>
                <p className="muted small-text">
                  Add what you know. Specifications describe this computer; individual parts can
                  also be linked from your deck.
                </p>
              </div>
              <Field label="Processor">
                <input
                  name={`${prefix}processor`}
                  maxLength={160}
                  defaultValue={item?.systemSpecs?.processor}
                  placeholder="e.g. AMD Ryzen 7 7800X3D"
                />
              </Field>
              <Field label="Graphics">
                <input
                  name={`${prefix}graphics`}
                  maxLength={160}
                  defaultValue={item?.systemSpecs?.graphics}
                  placeholder="e.g. NVIDIA RTX 4070 / integrated"
                />
              </Field>
              <Field label="Memory (GB)">
                <input
                  name={`${prefix}memoryGB`}
                  type="number"
                  min="0.5"
                  max="16384"
                  step="0.5"
                  defaultValue={item?.systemSpecs?.memoryGB ?? ''}
                  placeholder="32"
                />
              </Field>
              <Field label="Storage">
                <input
                  name={`${prefix}storage`}
                  maxLength={500}
                  defaultValue={item?.systemSpecs?.storage}
                  placeholder="e.g. 1 TB NVMe SSD + 4 TB HDD"
                />
              </Field>
              <Field label="Motherboard">
                <input
                  name={`${prefix}motherboard`}
                  maxLength={160}
                  defaultValue={item?.systemSpecs?.motherboard}
                  placeholder="e.g. ASUS B650"
                />
              </Field>
              <Field label="Power supply">
                <input
                  name={`${prefix}powerSupply`}
                  maxLength={160}
                  defaultValue={item?.systemSpecs?.powerSupply}
                  placeholder="e.g. Corsair RM750x · 750 W"
                />
              </Field>
              <Field label="Operating system" className="full">
                <input
                  name={`${prefix}operatingSystem`}
                  maxLength={160}
                  defaultValue={item?.systemSpecs?.operatingSystem}
                  placeholder="e.g. Windows 11 / Ubuntu 24.04"
                />
              </Field>
            </>
          )}
          <ConnectivityFields
            key={JSON.stringify(connectivityOverride)}
            initial={connectivityOverride ?? item?.connectivity}
            prefix={prefix}
          />
          <Field label="Notes" className="full">
            <textarea
              name={`${prefix}notes`}
              rows={3}
              defaultValue={item?.notes}
              maxLength={10000}
              placeholder="Specifications, quirks, ideas for a future build…"
            />
          </Field>
        </>
      )}
    </div>
  );
}
