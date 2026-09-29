import type { Valuation, ValuationRecord, PortfolioEvent } from '../shared/valuation.js';
import {
  decodeValuation,
  valuationRecord,
  valuationFingerprint,
  itemValueFields,
  type ValuationRow,
} from './valuation-records.js';
import { portfolioChanges } from './portfolio.js';
import { randomUUID } from 'node:crypto';
import type { DB } from './db.js';
import type {
  Assignment,
  InventoryItem,
  Location,
  Project,
  ProjectTemplate,
  Requirement,
  SystemComponent,
} from '../shared/types.js';
import type { ItemInput, ProjectInput } from '../shared/validation.js';
import { AppError } from './errors.js';
import {
  assertEditableSystem,
  assertInstall,
  assertItemUpdate,
  hydrateInventory,
  type InventoryRow,
} from './inventory.js';

type RequirementRow = Omit<Requirement, 'categories' | 'tags' | 'optional'> & {
  categories: string;
  tags: string;
  optional: number;
};
function decodeRequirements(rows: RequirementRow[]): Requirement[] {
  return rows.map((r) => ({
    ...r,
    categories: JSON.parse(r.categories),
    tags: JSON.parse(r.tags),
    optional: !!r.optional,
  }));
}
export class Repository {
  constructor(
    public db: DB,
    public userId: string,
  ) {}
  private mutationDepth = 0;
  private mutate<T>(callback: () => T): T {
    if (this.mutationDepth) return callback();
    return this.db
      .transaction(() => {
        const before = this.inventory();
        this.mutationDepth++;
        try {
          const result = callback();
          const createdAt = new Date().toISOString();
          for (const event of portfolioChanges(before, this.inventory()))
            this.db
              .prepare(
                'INSERT INTO portfolio_value_events(userId,itemId,valueCents,createdAt) VALUES (?,?,?,?)',
              )
              .run(this.userId, event.itemId, event.valueCents, createdAt);
          return result;
        } finally {
          this.mutationDepth--;
        }
      })
      .immediate();
  }
  portfolioEvents(): PortfolioEvent[] {
    return this.db
      .prepare(
        'SELECT sequence,itemId,valueCents,createdAt FROM portfolio_value_events WHERE userId=? ORDER BY sequence',
      )
      .all(this.userId) as PortfolioEvent[];
  }
  valuations(id: string): ValuationRecord[] {
    this.item(id);
    return (
      this.db
        .prepare(
          'SELECT * FROM equipment_valuations WHERE userId=? AND itemId=? ORDER BY createdAt,id',
        )
        .all(this.userId, id) as ValuationRow[]
    ).map(decodeValuation);
  }
  private insertValuation(record: ValuationRecord) {
    this.db
      .prepare(
        'INSERT INTO equipment_valuations(id,userId,itemId,valuation,effectiveValueCents,source,provider,inputFingerprint,createdAt,appliedAt) VALUES (@id,@userId,@itemId,@valuation,@effectiveValueCents,@source,@provider,@inputFingerprint,@createdAt,@appliedAt)',
      )
      .run({
        ...record,
        userId: this.userId,
        valuation: record.valuation ? JSON.stringify(record.valuation) : null,
      });
  }
  proposeValuation(
    id: string,
    valuation: Valuation,
    provider: string,
    expectedFingerprint: string,
  ) {
    return this.mutate(() => {
      const item = this.item(id);
      const record = {
        ...valuationRecord(id, valuation, null, 'ai', provider, false),
        inputFingerprint: valuationFingerprint(item, this.inventory()),
      };
      if (record.inputFingerprint !== expectedFingerprint)
        throw new AppError(
          409,
          'Hardware changed while estimating. Review its details and try again.',
        );
      this.insertValuation(record);
      return record;
    });
  }
  applyValuation(id: string, valuationId: string, replaceManual: boolean) {
    return this.mutate(() => {
      const item = this.item(id);
      const record = this.valuations(id).find((v) => v.id === valuationId);
      if (!record?.valuation) throw new AppError(404, 'Valuation not found.');
      if (record.appliedAt) return item; // Retry-safe acceptance.
      if (
        record.createdAt < item.updatedAt ||
        record.inputFingerprint !== valuationFingerprint(item, this.inventory())
      )
        throw new AppError(
          409,
          'Hardware changed since this estimate. Refresh the valuation before applying it.',
        );
      const manual = replaceManual ? null : item.manualValueOverrideCents;
      const value = manual ?? record.valuation.estimatedValueCents;
      const now = new Date().toISOString();
      this.db
        .prepare(
          'UPDATE inventory_items SET aiValuation=?,manualValueOverrideCents=?,estimatedValueCents=?,valuationUpdatedAt=?,updatedAt=? WHERE userId=? AND id=?',
        )
        .run(JSON.stringify(record.valuation), manual, value, now, now, this.userId, id);
      this.db
        .prepare(
          'UPDATE equipment_valuations SET appliedAt=?,effectiveValueCents=? WHERE userId=? AND itemId=? AND id=?',
        )
        .run(now, value, this.userId, id, valuationId);
      return this.item(id);
    });
  }
  setManualValue(id: string, value: number | null) {
    return this.mutate(() => {
      const item = this.item(id);
      const effective = value ?? item.aiValuation?.estimatedValueCents ?? null;
      const now = new Date().toISOString();
      if (value === item.manualValueOverrideCents) return item;
      this.db
        .prepare(
          'UPDATE inventory_items SET manualValueOverrideCents=?,estimatedValueCents=?,valuationUpdatedAt=?,updatedAt=? WHERE userId=? AND id=?',
        )
        .run(value, effective, now, now, this.userId, id);
      this.insertValuation(valuationRecord(id, item.aiValuation, effective, 'manual', 'user'));
      return this.item(id);
    });
  }
  assignments(): Assignment[] {
    return this.db
      .prepare(
        `SELECT a.id,a.projectId,p.name projectName,p.status projectStatus,a.itemId,i.name itemName,a.quantity FROM project_assignments a JOIN projects p ON p.id=a.projectId JOIN inventory_items i ON i.id=a.itemId WHERE a.userId=?`,
      )
      .all(this.userId) as Assignment[];
  }
  inventory(): InventoryItem[] {
    const assignments = this.assignments();
    const tagRows = this.db
      .prepare('SELECT itemId,tag FROM item_tags WHERE userId=?')
      .all(this.userId) as { itemId: string; tag: string }[];
    const rows = this.db
      .prepare(
        `SELECT i.*,l.name locationName FROM inventory_items i LEFT JOIN locations l ON l.id=i.locationId WHERE i.userId=? ORDER BY i.createdAt DESC,i.id`,
      )
      .all(this.userId) as InventoryRow[];
    const components = this.db
      .prepare(
        'SELECT c.*,s.name systemName,i.name itemName,i.category FROM system_components c JOIN inventory_items s ON s.id=c.systemId JOIN inventory_items i ON i.id=c.itemId WHERE c.userId=?',
      )
      .all(this.userId) as SystemComponent[];
    return hydrateInventory(rows, assignments, tagRows, components);
  }

  item(id: string) {
    const item = this.inventory().find((i) => i.id === id);
    if (!item) throw new AppError(404, 'Hardware not found.');
    return item;
  }
  saveItem(input: ItemInput, id: string = randomUUID(), update = false) {
    return this.mutate(() => {
      const previous = update ? this.item(id) : undefined;
      if (previous) assertItemUpdate(previous, input);
      if (
        input.locationId &&
        !this.db
          .prepare('SELECT id FROM locations WHERE id=? AND userId=?')
          .get(input.locationId, this.userId)
      )
        throw new AppError(400, 'Choose one of your locations.');
      this.db
        .prepare('INSERT OR IGNORE INTO categories(userId,name) VALUES (?,?)')
        .run(this.userId, input.category);
      const { tags, systemSpecs, initialValuation: _initial, ...rest } = input;
      void _initial;
      const { record, aiValuation, ...valueFields } = itemValueFields(input, previous);
      const fields = {
        ...rest,
        ...valueFields,
        aiValuation: aiValuation ? JSON.stringify(aiValuation) : null,
        systemSpecs: systemSpecs ? JSON.stringify(systemSpecs) : null,
      };
      const keys = Object.keys(fields);
      if (update)
        this.db
          .prepare(
            `UPDATE inventory_items SET ${keys.map((k) => `${k}=@${k}`).join(',')},updatedAt=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=@id AND userId=@userId`,
          )
          .run({ ...fields, id, userId: this.userId });
      else
        this.db
          .prepare(
            `INSERT INTO inventory_items(id,userId,${keys.join(',')}) VALUES (@id,@userId,${keys.map((k) => `@${k}`).join(',')})`,
          )
          .run({ ...fields, id, userId: this.userId });
      this.db.prepare('DELETE FROM item_tags WHERE itemId=? AND userId=?').run(id, this.userId);
      for (const tag of tags) {
        this.db
          .prepare('INSERT OR IGNORE INTO tags(userId,name) VALUES (?,?)')
          .run(this.userId, tag);
        this.db
          .prepare('INSERT INTO item_tags(userId,itemId,tag) VALUES (?,?,?)')
          .run(this.userId, id, tag);
      }
      if (record) this.insertValuation({ ...record, itemId: id });
      return this.item(id);
    });
  }
  createSystem(input: ItemInput, components: ItemInput[]) {
    return this.mutate(() => {
      const system = this.saveItem(input);
      for (const component of components) {
        const part = this.saveItem(component);
        this.install(system.id, part.id, part.quantity);
      }
      return this.item(system.id);
    });
  }
  deleteItem(id: string) {
    this.mutate(() => {
      const item = this.item(id);
      if (item.assignments.length || item.installedIn.length)
        throw new AppError(
          409,
          'Release this hardware from projects and computers before deleting it.',
        );
      this.db.prepare('DELETE FROM inventory_items WHERE id=? AND userId=?').run(id, this.userId);
    });
  }
  locations(): Location[] {
    return this.db
      .prepare(
        'SELECT l.id,l.name,l.description,COUNT(i.id) itemCount FROM locations l LEFT JOIN inventory_items i ON i.locationId=l.id WHERE l.userId=? GROUP BY l.id ORDER BY l.name',
      )
      .all(this.userId) as Location[];
  }
  saveLocation(name: string, description: string, id: string = randomUUID(), update = false) {
    if (update && !this.locations().some((l) => l.id === id))
      throw new AppError(404, 'Location not found.');
    if (
      this.db
        .prepare('SELECT id FROM locations WHERE userId=? AND name=? AND id!=?')
        .get(this.userId, name, id)
    )
      throw new AppError(409, 'A location with this name already exists.');
    if (update)
      this.db
        .prepare('UPDATE locations SET name=?,description=? WHERE id=? AND userId=?')
        .run(name, description, id, this.userId);
    else
      this.db
        .prepare('INSERT INTO locations(id,userId,name,description) VALUES (?,?,?,?)')
        .run(id, this.userId, name, description);
    return this.locations().find((l) => l.id === id)!;
  }
  deleteLocation(id: string) {
    this.db.transaction(() => {
      if (!this.locations().some((l) => l.id === id))
        throw new AppError(404, 'Location not found.');
      this.db
        .prepare('UPDATE inventory_items SET locationId=NULL WHERE userId=? AND locationId=?')
        .run(this.userId, id);
      this.db.prepare('DELETE FROM locations WHERE userId=? AND id=?').run(this.userId, id);
    })();
  }
  projects(): Project[] {
    const assignments = this.assignments();
    return (
      this.db
        .prepare('SELECT * FROM projects WHERE userId=? ORDER BY createdAt DESC')
        .all(this.userId) as Project[]
    ).map((p) => ({
      ...p,
      assignments: assignments.filter((a) => a.projectId === p.id),
      requirements: decodeRequirements(
        this.db
          .prepare('SELECT * FROM project_requirements WHERE projectId=?')
          .all(p.id) as RequirementRow[],
      ),
    }));
  }
  project(id: string) {
    const p = this.projects().find((p) => p.id === id);
    if (!p) throw new AppError(404, 'Project not found.');
    return p;
  }
  saveProject(input: ProjectInput, id: string = randomUUID(), update = false) {
    return this.db.transaction(() => {
      if (update) this.project(id);
      const { requirements, ...p } = input;
      if (update)
        this.db
          .prepare(
            'UPDATE projects SET name=@name,description=@description,status=@status,notes=@notes,estimatedCostCents=@estimatedCostCents WHERE id=@id AND userId=@userId',
          )
          .run({ ...p, id, userId: this.userId });
      else
        this.db
          .prepare(
            'INSERT INTO projects(id,userId,name,description,status,notes,estimatedCostCents) VALUES (@id,@userId,@name,@description,@status,@notes,@estimatedCostCents)',
          )
          .run({ ...p, id, userId: this.userId });
      this.db.prepare('DELETE FROM project_requirements WHERE projectId=?').run(id);
      for (const r of requirements)
        this.db
          .prepare(
            'INSERT INTO project_requirements(id,projectId,name,categories,tags,quantity,optional,estimatedUnitCostCents) VALUES (?,?,?,?,?,?,?,?)',
          )
          .run(
            randomUUID(),
            id,
            r.name,
            JSON.stringify(r.categories),
            JSON.stringify(r.tags),
            r.quantity,
            Number(r.optional),
            r.estimatedUnitCostCents,
          );
      // Completed builds keep their hardware in use; abandoned plans release it.
      if (input.status === 'Abandoned')
        this.db
          .prepare('DELETE FROM project_assignments WHERE projectId=? AND userId=?')
          .run(id, this.userId);
      return this.project(id);
    })();
  }
  deleteProject(id: string) {
    this.project(id);
    this.db.prepare('DELETE FROM projects WHERE id=? AND userId=?').run(id, this.userId);
  }
  assign(projectId: string, itemId: string, quantity: number) {
    return this.db
      .transaction(() => {
        if (this.project(projectId).status === 'Abandoned')
          throw new AppError(409, 'Reopen this project before assigning hardware.');
        const item = this.item(itemId);
        if (quantity > item.availableQuantity)
          throw new AppError(
            409,
            `Only ${item.availableQuantity} units are available. Refresh your deck and try again.`,
          );
        this.db
          .prepare(
            'INSERT INTO project_assignments(id,userId,projectId,itemId,quantity) VALUES (?,?,?,?,?) ON CONFLICT(projectId,itemId) DO UPDATE SET quantity=quantity+excluded.quantity',
          )
          .run(randomUUID(), this.userId, projectId, itemId, quantity);
        return this.project(projectId);
      })
      .immediate();
  }
  release(projectId: string, assignmentId: string) {
    this.project(projectId);
    const result = this.db
      .prepare('DELETE FROM project_assignments WHERE id=? AND projectId=? AND userId=?')
      .run(assignmentId, projectId, this.userId);
    if (!result.changes) throw new AppError(404, 'Assignment not found.');
  }
  install(systemId: string, itemId: string, quantity: number) {
    return this.mutate(() => {
      assertInstall(this.item(systemId), this.item(itemId), quantity);
      this.db
        .prepare(
          'INSERT INTO system_components(id,userId,systemId,itemId,quantity) VALUES (?,?,?,?,?) ON CONFLICT(systemId,itemId) DO UPDATE SET quantity=quantity+excluded.quantity',
        )
        .run(randomUUID(), this.userId, systemId, itemId, quantity);
      return this.item(systemId);
    });
  }
  uninstall(systemId: string, componentId: string) {
    this.mutate(() => {
      assertEditableSystem(this.item(systemId));
      const result = this.db
        .prepare('DELETE FROM system_components WHERE id=? AND systemId=? AND userId=?')
        .run(componentId, systemId, this.userId);
      if (!result.changes) throw new AppError(404, 'Installed part not found.');
    });
  }
  templates(): ProjectTemplate[] {
    return (
      this.db.prepare('SELECT * FROM project_templates ORDER BY rowid').all() as ProjectTemplate[]
    ).map((t) => ({
      ...t,
      requirements: decodeRequirements(
        this.db
          .prepare('SELECT * FROM template_requirements WHERE templateId=? ORDER BY rowid')
          .all(t.id) as RequirementRow[],
      ),
    }));
  }
}
