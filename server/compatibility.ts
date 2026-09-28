import type {
  InventoryItem,
  ProjectTemplate,
  Recommendation,
  Requirement,
  RequirementMatch,
} from '../shared/types.js';
export function matches(item: InventoryItem, requirement: Requirement) {
  return (
    (!requirement.categories.length || requirement.categories.includes(item.category)) &&
    requirement.tags.every((tag) => item.tags.includes(tag))
  );
}
// Integer-capacity bipartite flow maximizes covered units and can reassign an earlier
// match when a later requirement needs the same part. No physical unit is used twice.
function allocate(
  requirements: Requirement[],
  inventory: InventoryItem[],
  remaining: Map<string, number>,
): RequirementMatch[] {
  type Edge = { to: number; reverse: number; capacity: number; initial: number };
  const source = 0,
    itemStart = 1,
    reqStart = itemStart + inventory.length,
    sink = reqStart + requirements.length;
  const graph: Edge[][] = Array.from({ length: sink + 1 }, () => []);
  function edge(from: number, to: number, capacity: number) {
    const forward = { to, reverse: graph[to].length, capacity, initial: capacity };
    graph[from].push(forward);
    graph[to].push({ to: from, reverse: graph[from].length - 1, capacity: 0, initial: 0 });
    return forward;
  }
  const candidates: { item: InventoryItem; reqIndex: number; edge: Edge }[] = [];
  inventory.forEach((item, i) => {
    edge(source, itemStart + i, remaining.get(item.id) || 0);
    requirements.forEach((r, j) => {
      if (matches(item, r))
        candidates.push({ item, reqIndex: j, edge: edge(itemStart + i, reqStart + j, r.quantity) });
    });
  });
  requirements.forEach((r, j) => edge(reqStart + j, sink, r.quantity));
  while (true) {
    const parent: ({ node: number; index: number } | undefined)[] = Array(graph.length);
    const seen = new Set([source]);
    const queue = [source];
    for (let head = 0; head < queue.length && !seen.has(sink); head++) {
      const node = queue[head];
      graph[node].forEach((e, index) => {
        if (e.capacity > 0 && !seen.has(e.to)) {
          seen.add(e.to);
          parent[e.to] = { node, index };
          queue.push(e.to);
        }
      });
    }
    if (!seen.has(sink)) break;
    let amount = Infinity;
    for (let v = sink; v !== source;) {
      const p = parent[v]!;
      amount = Math.min(amount, graph[p.node][p.index].capacity);
      v = p.node;
    }
    for (let v = sink; v !== source;) {
      const p = parent[v]!;
      const e = graph[p.node][p.index];
      e.capacity -= amount;
      graph[v][e.reverse].capacity += amount;
      v = p.node;
    }
  }
  const results: RequirementMatch[] = requirements.map((requirement) => ({
    requirement,
    matched: [],
    missingQuantity: requirement.quantity,
  }));
  for (const candidate of candidates) {
    const quantity = candidate.edge.initial - candidate.edge.capacity;
    if (quantity <= 0) continue;
    results[candidate.reqIndex].matched.push({
      itemId: candidate.item.id,
      name: candidate.item.name,
      quantity,
    });
    results[candidate.reqIndex].missingQuantity -= quantity;
    remaining.set(candidate.item.id, (remaining.get(candidate.item.id) || 0) - quantity);
  }
  return results;
}
export function evaluateTemplate(
  template: ProjectTemplate,
  inventory: InventoryItem[],
): Recommendation {
  const available = inventory
    .filter((i) => i.availableQuantity > 0)
    .sort((a, b) => a.id.localeCompare(b.id));
  const remaining = new Map(available.map((i) => [i.id, i.availableQuantity]));
  const required = allocate(
    template.requirements.filter((r) => !r.optional),
    available,
    remaining,
  );
  const optional = allocate(
    template.requirements.filter((r) => r.optional),
    available,
    remaining,
  );
  const missingCount = required.reduce((n, r) => n + r.missingQuantity, 0);
  const total = required.reduce((n, r) => n + r.requirement.quantity, 0);
  return {
    template,
    required,
    optional,
    missingCount,
    readiness: total ? Math.round(((total - missingCount) / total) * 100) : 100,
    status: !missingCount
      ? 'Ready to Build'
      : missingCount <= 2
        ? 'Almost Ready'
        : 'Missing Hardware',
    additionalCostCents: required.reduce(
      (n, r) => n + r.missingQuantity * r.requirement.estimatedUnitCostCents,
      0,
    ),
  };
}
export function recommend(templates: ProjectTemplate[], inventory: InventoryItem[]) {
  return templates
    .map((t) => evaluateTemplate(t, inventory))
    .sort(
      (a, b) =>
        a.missingCount - b.missingCount ||
        a.additionalCostCents - b.additionalCostCents ||
        a.template.name.localeCompare(b.template.name),
    );
}
