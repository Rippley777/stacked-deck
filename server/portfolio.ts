import type { InventoryItem } from '../shared/types.js';
import { gain, type Portfolio, type PortfolioEvent, type ValuePoint } from '../shared/valuation.js';

export function contributions(
  items: InventoryItem[],
  field: 'estimatedValueCents' | 'purchasePriceCents' = 'estimatedValueCents',
) {
  const lookup = new Map(items.map((i) => [i.id, i]));
  return items.map((item) => {
    const quantity = ['Sold', 'Archived'].includes(item.status)
      ? 0
      : item.quantity - item.installedIn.reduce((n, c) => n + c.quantity, 0);
    const value =
      item.kind === 'System' && item[field] === null && item.components.length
        ? item.components.reduce<number | null>((n, c) => {
            const part = lookup.get(c.itemId)?.[field] ?? null;
            return n === null || part === null ? null : n + part * c.quantity;
          }, 0)
        : item[field];
    // Totals include known parts even if a whole computer is only partially valued.
    const knownValue =
      value ??
      (item.kind === 'System'
        ? item.components.reduce((n, c) => n + (lookup.get(c.itemId)?.[field] ?? 0) * c.quantity, 0)
        : 0);
    return {
      id: item.id,
      name: item.name,
      category: item.category,
      valueCents: knownValue * quantity,
      known: value !== null,
      quantity,
    };
  });
}
export function portfolioChanges(before: InventoryItem[], after: InventoryItem[]) {
  const previous = new Map(contributions(before).map((i) => [i.id, i.valueCents]));
  const next = new Map(contributions(after).map((i) => [i.id, i.valueCents]));
  return [...new Set([...previous.keys(), ...next.keys()])]
    .filter((id) => previous.get(id) !== next.get(id))
    .map((itemId) => ({ itemId, valueCents: next.get(itemId) ?? 0 }));
}
export function portfolioHistory(events: PortfolioEvent[]): ValuePoint[] {
  const current = new Map<string, number>();
  const days = new Map<string, number>();
  let total = 0;
  for (const event of events) {
    total += event.valueCents - (current.get(event.itemId) ?? 0);
    current.set(event.itemId, event.valueCents);
    days.set(event.createdAt.slice(0, 10), total);
  }
  // End-of-day observations, carried forward to today; never invent pre-baseline prices.
  if (events.length) days.set(new Date().toISOString().slice(0, 10), total);
  return [...days].map(([date, valueCents]) => ({ date, valueCents }));
}
export function summarizePortfolio(items: InventoryItem[], events: PortfolioEvent[]): Portfolio {
  const values = contributions(items);
  const costs = new Map(contributions(items, 'purchasePriceCents').map((i) => [i.id, i]));
  const totalValueCents = values.reduce((n, i) => n + i.valueCents, 0);
  const totalSpentCents = [...costs.values()].reduce((n, i) => n + i.valueCents, 0);
  const comparable = values.filter((v) => v.quantity > 0 && v.known && costs.get(v.id)?.known);
  const comparableGain = gain(
    comparable.reduce((n, i) => n + i.valueCents, 0),
    comparable.reduce((n, i) => n + costs.get(i.id)!.valueCents, 0),
  );
  const categories = new Map<string, number>();
  values
    .filter((i) => i.quantity > 0)
    .forEach((i) => categories.set(i.category, (categories.get(i.category) ?? 0) + i.valueCents));
  const most = values
    .filter((i) => i.quantity > 0 && i.known)
    .sort((a, b) => b.valueCents - a.valueCents)[0];
  return {
    totalValueCents,
    totalSpentCents,
    gainCents: totalValueCents - totalSpentCents,
    gainPercent: gain(totalValueCents, totalSpentCents).percent,
    comparableGainCents: comparableGain.cents ?? 0,
    comparableGainPercent: comparableGain.percent,
    missingValues: items
      .filter((i) => !['Sold', 'Archived'].includes(i.status) && i.estimatedValueCents === null)
      .map(({ id, name }) => ({ id, name })),
    missingPurchasePrices: values.filter((v) => v.quantity > 0 && !costs.get(v.id)?.known).length,
    categories: [...categories]
      .map(([name, valueCents]) => ({ name, valueCents }))
      .sort((a, b) => b.valueCents - a.valueCents),
    mostValuable: most ? { id: most.id, name: most.name, valueCents: most.valueCents } : null,
    history: portfolioHistory(events),
  };
}
