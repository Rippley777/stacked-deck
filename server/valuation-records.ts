import { randomUUID, createHash } from 'node:crypto';
import type { InventoryItem } from '../shared/types.js';
import type { ItemInput } from '../shared/validation.js';
import type { Valuation, ValuationRecord } from '../shared/valuation.js';
export type ValuationRow = Omit<ValuationRecord, 'valuation'> & { valuation: string | null };
export const decodeValuation = (row: ValuationRow): ValuationRecord => ({
  ...row,
  valuation: row.valuation ? JSON.parse(row.valuation) : null,
});
export function valuationRecord(
  itemId: string,
  valuation: Valuation | null,
  effectiveValueCents: number | null,
  source: 'ai' | 'manual',
  provider: string,
  applied = true,
): ValuationRecord {
  const createdAt = new Date().toISOString();
  return {
    id: randomUUID(),
    itemId,
    valuation,
    effectiveValueCents,
    source,
    provider,
    inputFingerprint: '',
    createdAt,
    appliedAt: applied ? createdAt : null,
  };
}
export function itemValueFields(input: ItemInput, previous?: InventoryItem) {
  const initial = previous ? null : (input.initialValuation ?? null);
  const aiValuation = previous?.aiValuation ?? initial;
  // Legacy estimatedValueCents remains the effective value contract. A changed form
  // value is a manual override; unrelated full-item edits preserve the source.
  const changed = !previous || input.estimatedValueCents !== previous.estimatedValueCents;
  const manualValueOverrideCents = changed
    ? input.estimatedValueCents
    : previous.manualValueOverrideCents;
  const estimatedValueCents = manualValueOverrideCents ?? aiValuation?.estimatedValueCents ?? null;
  return {
    aiValuation,
    manualValueOverrideCents,
    estimatedValueCents,
    valuationUpdatedAt: changed
      ? previous || estimatedValueCents !== null
        ? new Date().toISOString()
        : null
      : previous.valuationUpdatedAt,
    record:
      changed && (previous || estimatedValueCents !== null)
        ? valuationRecord(
            previous?.id ?? '',
            aiValuation,
            estimatedValueCents,
            initial && manualValueOverrideCents === null ? 'ai' : 'manual',
            initial ? 'openai:reviewed-initial' : 'user',
          )
        : null,
  };
}

export function valuationFingerprint(item: InventoryItem, inventory: InventoryItem[]) {
  const details = (i: InventoryItem) => ({
    name: i.name,
    manufacturer: i.manufacturer,
    model: i.model,
    category: i.category,
    condition: i.condition,
    notes: i.notes,
    systemSpecs: i.systemSpecs,
    purchaseDate: i.purchaseDate,
    purchasePriceCents: i.purchasePriceCents,
    tags: i.tags,
  });
  const lookup = new Map(inventory.map((i) => [i.id, i]));
  return createHash('sha256')
    .update(
      JSON.stringify({
        item: details(item),
        parts: item.components
          .map((c) => ({
            id: c.itemId,
            quantity: c.quantity,
            details: details(lookup.get(c.itemId)!),
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      }),
    )
    .digest('hex');
}
