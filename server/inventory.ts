import { contributions } from './portfolio.js';
import type { Assignment, InventoryItem, SystemComponent } from '../shared/types.js';
import type { ItemInput } from '../shared/validation.js';
import { AppError } from './errors.js';
export type InventoryRow = Omit<
  InventoryItem,
  | 'connectivity'
  | 'aiValuation'
  | 'systemSpecs'
  | 'tags'
  | 'assignments'
  | 'components'
  | 'installedIn'
  | 'availableQuantity'
> & { connectivity?: string | null; systemSpecs: string | null; aiValuation: string | null };
export function hydrateInventory(
  items: InventoryRow[],
  assignments: Assignment[],
  tags: { itemId: string; tag: string }[],
  components: SystemComponent[],
): InventoryItem[] {
  return items.map((item) => {
    const assigned = assignments.filter((a) => a.itemId === item.id);
    const installedIn = components.filter((c) => c.itemId === item.id);
    return {
      ...item,
      connectivity: item.connectivity ? JSON.parse(item.connectivity) : null,
      aiValuation: item.aiValuation ? JSON.parse(item.aiValuation) : null,
      systemSpecs: item.systemSpecs ? JSON.parse(item.systemSpecs) : null,
      tags: tags.filter((t) => t.itemId === item.id).map((t) => t.tag),
      assignments: assigned,
      components: components.filter((c) => c.systemId === item.id),
      installedIn,
      availableQuantity:
        item.status === 'Available'
          ? Math.max(
              0,
              item.quantity -
                assigned.reduce((n, a) => n + a.quantity, 0) -
                installedIn.reduce((n, c) => n + c.quantity, 0),
            )
          : 0,
    };
  });
}
export function assertItemUpdate(item: InventoryItem, input: ItemInput) {
  const allocated =
    item.assignments.reduce((n, a) => n + a.quantity, 0) +
    item.installedIn.reduce((n, c) => n + c.quantity, 0);
  if (input.quantity < allocated)
    throw new AppError(
      409,
      `This card has ${allocated} units assigned or installed. Release them before reducing quantity.`,
    );
  if (allocated && input.status !== 'Available')
    throw new AppError(
      409,
      'Release project assignments and installed parts before changing this card’s base status.',
    );
  if (item.kind !== input.kind && (allocated || item.components.length))
    throw new AppError(409, 'Release all linked hardware before changing this card’s kind.');
}
export function assertEditableSystem(system: InventoryItem) {
  if (system.kind !== 'System') throw new AppError(400, 'Choose a complete computer.');
  if (system.assignments.length)
    throw new AppError(
      409,
      'Release this computer from its projects before changing installed parts.',
    );
  if (['Sold', 'Archived'].includes(system.status))
    throw new AppError(409, 'Restore this computer before changing installed parts.');
}
export function assertInstall(system: InventoryItem, component: InventoryItem, quantity: number) {
  assertEditableSystem(system);
  if (component.kind !== 'Component')
    throw new AppError(400, 'Install individual parts, not another complete computer.');
  if (quantity > component.availableQuantity)
    throw new AppError(
      409,
      `Only ${component.availableQuantity} units are available. Refresh your deck and try again.`,
    );
}
// A whole-computer valuation replaces the value of its linked parts. If unset,
// the computer's value falls back to the sum of those parts.
export function inventoryValue(items: InventoryItem[], allItems = items) {
  const ids = new Set(items.map((i) => i.id));
  return contributions(allItems)
    .filter((i) => ids.has(i.id))
    .reduce((n, i) => n + i.valueCents, 0);
}
