import { describe, expect, it } from 'vitest';
import { evaluateTemplate, recommend } from '../server/compatibility.js';
import { itemSchema } from '../shared/validation.js';
import type { InventoryItem, ProjectTemplate, Requirement } from '../shared/types.js';
const item = (
  id: string,
  category: string,
  quantity: number,
  tags: string[] = [],
  availableQuantity = quantity,
): InventoryItem => ({
  ...itemSchema.parse({
    name: id,
    category,
    quantity,
    tags,
    condition: 'Good',
    status: 'Available',
  }),
  id,
  locationName: null,
  createdAt: '',
  updatedAt: '',
  assignments: [],
  components: [],
  installedIn: [],
  availableQuantity,
});
const req = (
  id: string,
  categories: string[],
  quantity = 1,
  optional = false,
  tags: string[] = [],
): Requirement => ({
  id,
  name: id,
  categories,
  quantity,
  optional,
  tags,
  estimatedUnitCostCents: 2500,
});
const template = (requirements: Requirement[], id = 'build'): ProjectTemplate => ({
  id,
  name: id,
  description: '',
  icon: 'server',
  accent: 'green',
  difficulty: 'Beginner',
  duration: '',
  caveat: '',
  requirements,
});
describe('deterministic compatibility', () => {
  it('matches required quantities and estimates only missing purchases', () => {
    const result = evaluateTemplate(
      template([req('host', ['Raspberry Pi']), req('drives', ['HDD'], 2)]),
      [item('Pi', 'Raspberry Pi', 1), item('WD Red', 'HDD', 1)],
    );
    expect(result.status).toBe('Almost Ready');
    expect(result.readiness).toBe(67);
    expect(result.missingCount).toBe(1);
    expect(result.additionalCostCents).toBe(2500);
    expect(result.required[1].matched[0]).toEqual({
      itemId: 'WD Red',
      name: 'WD Red',
      quantity: 1,
    });
  });
  it('does not double count a physical unit across requirements', () => {
    const r = evaluateTemplate(template([req('boot', ['SSD']), req('storage', ['SSD'])]), [
      item('SSD', 'SSD', 1),
    ]);
    expect(r.missingCount).toBe(1);
  });
  it('respects units reserved by other projects and unusable statuses', () => {
    expect(
      evaluateTemplate(template([req('nodes', ['Raspberry Pi'], 3)]), [
        item('Pi', 'Raspberry Pi', 3, [], 1),
      ]).missingCount,
    ).toBe(2);
    expect(
      evaluateTemplate(template([req('gpu', ['GPU'])]), [item('broken', 'GPU', 1, [], 0)])
        .missingCount,
    ).toBe(1);
  });
  it('requires all tags in addition to category to exclude laptop GPUs', () => {
    const r = evaluateTemplate(template([req('GPU', ['GPU'], 1, false, ['desktop'])]), [
      item('Laptop GPU', 'GPU', 1, ['laptop']),
      item('RTX', 'GPU', 1, ['desktop']),
    ]);
    expect(r.required[0].matched[0].name).toBe('RTX');
  });
  it('supports tag-only custom requirements', () => {
    expect(
      evaluateTemplate(template([req('Controller', [], 1, false, ['controller'])]), [
        item('Gamepad', 'Miscellaneous', 1, ['controller']),
      ]).readiness,
    ).toBe(100);
  });
  it('matches required parts before optional parts without lowering readiness', () => {
    const r = evaluateTemplate(
      template([req('optional storage', ['SSD'], 1, true), req('boot', ['SSD'])]),
      [item('SSD', 'SSD', 1)],
    );
    expect(r.status).toBe('Ready to Build');
    expect(r.optional[0].missingQuantity).toBe(1);
    expect(r.additionalCostCents).toBe(0);
  });
  it('allocates specialist matches before broader ones', () => {
    const r = evaluateTemplate(template([req('any', ['SSD', 'HDD']), req('specific', ['SSD'])]), [
      item('ssd', 'SSD', 1),
      item('hdd', 'HDD', 1),
    ]);
    expect(r.missingCount).toBe(0);
  });
  it('reroutes overlapping matches when a greedy assignment would miss a feasible build', () => {
    const r = evaluateTemplate(
      template([req('a', ['A', 'B']), req('b', ['A', 'C']), req('c', ['A', 'C'])]),
      [item('1', 'A', 1), item('2', 'B', 1), item('3', 'C', 1)],
    );
    expect(r.missingCount).toBe(0);
  });
  it('sorts independent recommendations by missing units then cost', () => {
    const rs = recommend(
      [template([req('cpu', ['CPU'])], 'missing'), template([req('ssd', ['SSD'])], 'ready')],
      [item('drive', 'SSD', 1)],
    );
    expect(rs[0].template.id).toBe('ready');
  });
});
