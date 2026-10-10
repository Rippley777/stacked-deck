import { z } from 'zod';
import { connectivitySchema } from './connectivity.js';
import type { InventoryItem } from './types.js';
import { conditions, itemStatuses, systemCategories } from './types.js';
import type { ItemInput } from './validation.js';

const identifier = z.string().max(160).optional();
export const duplicateDraftSchema = z.object({
  name: identifier,
  manufacturer: identifier,
  model: identifier,
  category: identifier,
  serialNumber: identifier,
  connectivity: connectivitySchema.nullable().optional(),
  kind: z.enum(['Component', 'System']).optional(),
  condition: z.enum(conditions).optional(),
  status: z.enum(itemStatuses).optional(),
  locationId: z.string().max(80).nullable().optional(),
  notes: z.string().max(10000).optional(),
  tags: z.array(z.string().max(60)).max(30).optional(),
  purchaseDate: z.string().max(20).nullable().optional(),
  purchasePriceCents: z.number().nullable().optional(),
  estimatedValueCents: z.number().nullable().optional(),
  imageUrl: z.string().max(2048).optional(),
});
export type DuplicateDraft = z.infer<typeof duplicateDraftSchema>;
export type DuplicateIdentity = DuplicateDraft & { id: string };
export type MatchStrength = 'exact' | 'strong' | 'possible';
export interface DuplicateMatch {
  itemId: string;
  name: string;
  quantity: number;
  availableQuantity: number;
  location: string | null;
  locationId: string | null;
  manufacturer: string;
  model: string;
  serialNumber: string;
  status: InventoryItem['status'];
  kind: InventoryItem['kind'];
  installedIn: string[];
  assignedTo: string[];
  mergeProblem: string | null;
  matchStrength: MatchStrength;
  reasons: string[];
}
export const normalizeIdentifier = (value?: string) =>
  (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
// Preserve punctuation in serials: AB-12 and AB12 may identify different physical units.
export const normalizeSerial = (value?: string) => (value || '').trim().toLowerCase();
export const normalizeModel = (value?: string) =>
  normalizeIdentifier(value).replace(/[-\s]+/g, ' ');
const generic = new Set([
  'cable',
  'usb cable',
  'usb c cable',
  'adapter',
  'ssd',
  'hdd',
  'monitor',
  'power supply',
  'gpu',
  'ram',
  'unknown',
  'n/a',
]);
const useful = (value?: string) =>
  normalizeModel(value).length >= 3 && !generic.has(normalizeModel(value));
export function hasDuplicateIdentity(draft: DuplicateDraft) {
  return Boolean(
    normalizeSerial(draft.serialNumber) ||
    useful(draft.model) ||
    (useful(draft.name) && normalizeIdentifier(draft.manufacturer)) ||
    draft.connectivity?.cable ||
    draft.connectivity?.adapter,
  );
}
function consistent(a: unknown, b: unknown): boolean {
  if (a === undefined || b === undefined) return true;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((v) => b.some((w) => consistent(v, w)))
    );
  if (a && b && typeof a === 'object' && typeof b === 'object')
    return Object.entries(a).every(([k, v]) => consistent(v, (b as Record<string, unknown>)[k]));
  return String(a).toLowerCase() === String(b).toLowerCase();
}
function sameConnectivity(draft: DuplicateDraft, item: DuplicateIdentity) {
  const c = draft.connectivity?.cable,
    other = item.connectivity?.cable;
  if (
    c?.a?.connector &&
    c.b?.connector &&
    other?.a?.connector &&
    other.b?.connector &&
    (
      ['maxPowerW', 'standard', 'lengthM', 'maxDataGbps', 'usbVersion', 'displayStandard'] as const
    ).some((key) => c[key] !== undefined && other[key] !== undefined)
  )
    return consistent(
      { ...c, notes: undefined, certification: undefined },
      { ...other, notes: undefined, certification: undefined },
    );
  const a = draft.connectivity?.adapter;
  const existing = item.connectivity?.adapter;
  return Boolean(
    a?.connector?.connector &&
    existing?.connector?.connector &&
    ((a.voltage && a.current && existing.voltage && existing.current) ||
      (a.pdProfiles?.length && existing.pdProfiles?.length)) &&
    consistent(a, existing),
  );
}

export function duplicateSignal(
  draft: DuplicateDraft,
  item: DuplicateIdentity,
): { matchStrength: MatchStrength; reasons: string[] } | null {
  const serial = normalizeSerial(draft.serialNumber);
  const otherSerial = normalizeSerial(item.serialNumber);
  const sameSerial = Boolean(serial && serial === otherSerial);
  const manufacturer = normalizeIdentifier(draft.manufacturer);
  const otherManufacturer = normalizeIdentifier(item.manufacturer);
  const category = normalizeIdentifier(draft.category);
  const otherCategory = normalizeIdentifier(item.category);
  const sameManufacturer = Boolean(manufacturer && manufacturer === otherManufacturer);
  const sameModel =
    useful(draft.model) && normalizeModel(draft.model) === normalizeModel(item.model);
  const conflict = Boolean(
    (manufacturer && otherManufacturer && manufacturer !== otherManufacturer) ||
    (category && otherCategory && category !== otherCategory),
  );
  const reasons: string[] = [];
  let matchStrength: MatchStrength = 'possible';
  if (sameSerial) {
    matchStrength = 'exact';
    reasons.push('Same serial number');
  }
  if (sameModel && !conflict) {
    reasons.push(
      sameManufacturer
        ? 'Same manufacturer and model'
        : 'Same model; identifying details are incomplete',
    );
    if (!sameSerial && sameManufacturer) matchStrength = 'strong';
  } else if (
    !conflict &&
    sameManufacturer &&
    useful(draft.name) &&
    normalizeModel(draft.name) === normalizeModel(item.name) &&
    !(draft.model && item.model && normalizeModel(draft.model) !== normalizeModel(item.model))
  ) {
    reasons.push('Same name and manufacturer');
  } else if (
    !conflict &&
    !(draft.model && item.model && normalizeModel(draft.model) !== normalizeModel(item.model)) &&
    sameConnectivity(draft, item)
  ) {
    reasons.push('Matching cable or adapter specifications');
  }
  if (!reasons.length) return null;
  if (!sameSerial && serial && otherSerial)
    reasons.push(
      sameModel
        ? 'Same model, different serial number — create another card for this unit'
        : 'Different serial numbers — create another card for this unit',
    );
  return { matchStrength, reasons };
}
export function matchingCandidates<T extends DuplicateIdentity>(
  draft: DuplicateDraft,
  inventory: T[],
) {
  if (!hasDuplicateIdentity(draft)) return [];
  const rank = { exact: 0, strong: 1, possible: 2 };
  return inventory
    .flatMap((item) => {
      const signal = duplicateSignal(draft, item);
      return signal ? [{ item, ...signal }] : [];
    })
    .sort(
      (a, b) => rank[a.matchStrength] - rank[b.matchStrength] || a.item.id.localeCompare(b.item.id),
    );
}
export function possibleDuplicates(
  draft: DuplicateDraft,
  inventory: InventoryItem[],
): DuplicateMatch[] {
  return matchingCandidates(draft, inventory).map(({ item, ...signal }) => ({
    mergeProblem: quantityMergeProblem(draft, item),
    itemId: item.id,
    name: item.name,
    quantity: item.quantity,
    availableQuantity: item.availableQuantity,
    location: item.locationName,
    locationId: item.locationId,
    manufacturer: item.manufacturer,
    model: item.model,
    serialNumber: item.serialNumber,
    status: item.status,
    kind: item.kind,
    installedIn: item.installedIn.map((c) => c.systemName),
    assignedTo: item.assignments.map((a) => a.projectName),
    ...signal,
  }));
}

// Called again inside the repository transaction before changing quantity.
export function quantityMergeProblem(
  draft: Partial<ItemInput>,
  item: InventoryItem,
): string | null {
  if (!duplicateSignal(draft, item))
    return 'These details no longer match. Create a separate card.';
  if (
    draft.kind === 'System' ||
    item.kind === 'System' ||
    [...systemCategories, 'Computer'].some((c) =>
      [draft.category, item.category].some(
        (v) => normalizeIdentifier(v) === normalizeIdentifier(c),
      ),
    )
  )
    return 'Track each complete computer on a separate card.';
  if (normalizeSerial(draft.serialNumber) || normalizeSerial(item.serialNumber))
    return 'Serial numbers identify individual units. Create another card for a separate unit.';
  if (['Archived', 'Sold'].includes(item.status))
    return 'Restore or edit this card before adding quantity.';
  if (item.installedIn.length || item.assignments.length)
    return 'This card has installed or project-assigned units. Create a separate card.';
  if (item.status !== 'Available' || (draft.status && draft.status !== 'Available'))
    return 'Only available, unassigned hardware can be combined here.';
  if ((draft.locationId || null) !== item.locationId)
    return 'Locations differ. Create a separate card to preserve location tracking.';
  for (const key of ['manufacturer', 'model', 'category', 'condition'] as const) {
    if (draft[key] && normalizeModel(draft[key]) !== normalizeModel(item[key]))
      return 'Item details differ. Create a separate card to preserve them.';
  }
  for (const key of [
    'notes',
    'purchaseDate',
    'purchasePriceCents',
    'estimatedValueCents',
    'imageUrl',
  ] as const) {
    if (draft[key] != null && draft[key] !== '' && draft[key] !== item[key])
      return 'Item details differ. Create a separate card to preserve them.';
  }
  if (draft.tags?.some((t) => !item.tags.includes(t)))
    return 'Tags differ. Create a separate card to preserve them.';
  if (
    draft.connectivity &&
    JSON.stringify(draft.connectivity) !== JSON.stringify(item.connectivity)
  )
    return 'Connection details differ. Create a separate card to preserve them.';
  return null;
}
