import { describe, expect, it } from 'vitest';
import {
  duplicateSignal,
  hasDuplicateIdentity,
  normalizeSerial,
  possibleDuplicates,
  quantityMergeProblem,
} from '../shared/duplicates';
import { itemSchema } from '../shared/validation';
import type { InventoryItem } from '../shared/types';
const draft = itemSchema.parse({
  name: 'NVIDIA RTX 3070 Ti',
  manufacturer: 'NVIDIA',
  model: 'RTX 3070 Ti',
  category: 'GPU',
  quantity: 1,
  condition: 'Good',
  status: 'Available',
});
const item = (overrides: Partial<InventoryItem> = {}): InventoryItem => ({
  ...draft,
  id: 'gpu',
  quantity: 3,
  locationName: null,
  installedIn: [],
  assignments: [],
  components: [],
  availableQuantity: 3,
  aiValuation: null,
  manualValueOverrideCents: null,
  valuationUpdatedAt: null,
  createdAt: '',
  updatedAt: '',
  ...overrides,
});

describe('conservative duplicate matching', () => {
  it('normalizes serial casing and surrounding whitespace without deleting punctuation', () => {
    expect(duplicateSignal({ serialNumber: ' abc123 ' }, item({ serialNumber: 'ABC123' }))).toEqual(
      { matchStrength: 'exact', reasons: ['Same serial number'] },
    );
    expect(normalizeSerial(' AB-12 ')).not.toBe(normalizeSerial('AB12'));
    expect(duplicateSignal({ serialNumber: 'AB12' }, item({ serialNumber: 'AB-12' }))).toBeNull();
  });
  it('matches manufacturer/model conservatively and preserves suffixes', () => {
    expect(
      duplicateSignal({ manufacturer: ' nvidia ', model: 'RTX-3070-Ti', category: 'GPU' }, item())
        ?.matchStrength,
    ).toBe('strong');
    expect(duplicateSignal({ ...draft, model: 'RTX 3070' }, item())).toBeNull();
    expect(duplicateSignal({ ...draft, manufacturer: 'Other brand' }, item())).toBeNull();
    expect(duplicateSignal({ ...draft, category: 'Monitor' }, item())).toBeNull();
    expect(duplicateSignal({ model: 'RTX 3070 Ti' }, item())?.matchStrength).toBe('possible');
  });
  it('ignores weak names and sticky fields, but accepts specific name with manufacturer context', () => {
    for (const name of ['Cable', 'USB cable', 'Adapter', 'SSD', 'Monitor', 'Power supply']) {
      expect(hasDuplicateIdentity({ name, category: 'Cable' })).toBe(false);
      expect(
        duplicateSignal({ name, manufacturer: 'Brand' }, item({ name, manufacturer: 'Brand' })),
      ).toBeNull();
    }
    expect(hasDuplicateIdentity({ category: 'GPU', locationId: 'office', tags: ['spare'] })).toBe(
      false,
    );
    expect(
      duplicateSignal({ name: draft.name, manufacturer: draft.manufacturer }, item())
        ?.matchStrength,
    ).toBe('possible');
  });
  it('explains different serials and keeps exact matches ahead of other models and old cards', () => {
    const matches = possibleDuplicates({ ...draft, serialNumber: 'NEW' }, [
      item({ id: 'a', serialNumber: 'OLD' }),
      item({ id: 'z', serialNumber: 'new', status: 'Archived' }),
    ]);
    expect(matches.map((m) => m.matchStrength)).toEqual(['exact', 'strong']);
    expect(matches[0].status).toBe('Archived');
    expect(matches[1].reasons.join(' ')).toContain('different serial number');
    expect(matches.every((m) => m.mergeProblem)).toBe(true);
  });
});

describe('quantity merge eligibility', () => {
  it('allows an untracked matching component and rejects meaningful metadata differences', () => {
    expect(quantityMergeProblem(draft, item())).toBeNull();
    for (const change of [
      { serialNumber: 'serial' },
      { kind: 'System' as const },
      { condition: 'Fair' as const },
      { status: 'Sold' as const },
      { notes: 'Unique history' },
      { purchasePriceCents: 1200 },
      { tags: ['different'] },
    ]) {
      expect(quantityMergeProblem({ ...draft, ...change }, item())).toBeTruthy();
    }
    expect(quantityMergeProblem(draft, item({ locationId: 'elsewhere' }))).toContain(
      'Locations differ',
    );
    for (const status of ['Sold', 'Archived'] as const)
      expect(quantityMergeProblem(draft, item({ status }))).toContain('Restore');
  });
});
