import { randomUUID } from 'node:crypto';
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
import type { UserRepository } from './store.js';
import { AppError } from './errors.js';
import {
  assertEditableSystem,
  assertInstall,
  assertItemUpdate,
  hydrateInventory,
  type InventoryRow,
} from './inventory.js';
import {
  rows,
  execute,
  type SqlConnection,
  type SqlParameters,
  type SqlServerStore,
} from './sqlserver-store.js';
type RequirementRow = Omit<Requirement, 'categories' | 'tags'> & {
  categories: string;
  tags: string;
  projectId?: string;
  templateId?: string;
};
const decode = (row: RequirementRow): Requirement => ({
  ...row,
  categories: JSON.parse(row.categories),
  tags: JSON.parse(row.tags),
  optional: !!row.optional,
});
export class SqlServerRepository implements UserRepository {
  constructor(
    public store: SqlServerStore,
    public userId: string,
    private transaction?: SqlConnection,
  ) {}
  private get connection() {
    return this.transaction || this.store.pool;
  }
  private query<T>(statement: string, parameters: SqlParameters = {}) {
    return rows<T>(this.connection, statement, { ...parameters, userId: this.userId });
  }
  private run(statement: string, parameters: SqlParameters = {}) {
    return execute(this.connection, statement, { ...parameters, userId: this.userId });
  }
  private mutate<T>(callback: (repository: SqlServerRepository) => Promise<T>): Promise<T> {
    return this.transaction
      ? callback(this)
      : this.store.transaction(`owner:${this.userId}`, (tx) =>
          callback(new SqlServerRepository(this.store, this.userId, tx)),
        );
  }
  async assignments(): Promise<Assignment[]> {
    return this.query(
      'SELECT a.id,a.projectId,p.name projectName,p.status projectStatus,a.itemId,i.name itemName,a.quantity FROM project_assignments a JOIN projects p ON p.id=a.projectId JOIN inventory_items i ON i.id=a.itemId WHERE a.userId=@userId',
    );
  }
  async inventory(): Promise<InventoryItem[]> {
    const assignments = await this.assignments();
    const tagRows = await this.query<{ itemId: string; tag: string }>(
      'SELECT itemId,tag FROM item_tags WHERE userId=@userId',
    );
    const items = await this.query<InventoryRow>(
      'SELECT i.*,l.name locationName FROM inventory_items i LEFT JOIN locations l ON l.id=i.locationId WHERE i.userId=@userId ORDER BY i.createdAt DESC,i.id',
    );
    const components = await this.query<SystemComponent>(
      'SELECT c.*,s.name systemName,i.name itemName,i.category FROM system_components c JOIN inventory_items s ON s.id=c.systemId JOIN inventory_items i ON i.id=c.itemId WHERE c.userId=@userId',
    );
    return hydrateInventory(items, assignments, tagRows, components);
  }
  async item(id: string) {
    const item = (await this.inventory()).find((i) => i.id === id);
    if (!item) throw new AppError(404, 'Hardware not found.');
    return item;
  }
  async saveItem(
    input: ItemInput,
    id: string = randomUUID(),
    update = false,
  ): Promise<InventoryItem> {
    return this.mutate(async (r) => {
      if (update) assertItemUpdate(await r.item(id), input);
      if (
        input.locationId &&
        !(
          await r.query('SELECT id FROM locations WHERE id=@id AND userId=@userId', {
            id: input.locationId,
          })
        ).length
      )
        throw new AppError(400, 'Choose one of your locations.');
      await r.run(
        'IF NOT EXISTS(SELECT 1 FROM categories WHERE userId=@userId AND name=@name) INSERT INTO categories(userId,name) VALUES (@userId,@name)',
        { name: input.category },
      );
      const { tags, systemSpecs, ...rest } = input;
      const fields = { ...rest, systemSpecs: systemSpecs ? JSON.stringify(systemSpecs) : null };
      const keys = Object.keys(fields);
      if (update)
        await r.run(
          `UPDATE inventory_items SET ${keys.map((k) => `[${k}]=@${k}`).join(',')},updatedAt=CONVERT(varchar(23),SYSUTCDATETIME(),126)+'Z' WHERE id=@id AND userId=@userId`,
          { ...fields, id },
        );
      else
        await r.run(
          `INSERT INTO inventory_items(id,userId,${keys.map((k) => `[${k}]`).join(',')}) VALUES (@id,@userId,${keys.map((k) => `@${k}`).join(',')})`,
          { ...fields, id },
        );
      await r.run('DELETE FROM item_tags WHERE itemId=@id AND userId=@userId', { id });
      for (const tag of tags)
        await r.run(
          'IF NOT EXISTS(SELECT 1 FROM tags WHERE userId=@userId AND name=@tag) INSERT INTO tags(userId,name) VALUES (@userId,@tag); INSERT INTO item_tags(userId,itemId,tag) VALUES (@userId,@id,@tag)',
          { id, tag },
        );
      return r.item(id);
    });
  }
  async createSystem(input: ItemInput, components: ItemInput[]): Promise<InventoryItem> {
    return this.mutate(async (r) => {
      const system = await r.saveItem(input);
      for (const component of components) {
        const part = await r.saveItem(component);
        await r.install(system.id, part.id, part.quantity);
      }
      return r.item(system.id);
    });
  }
  async deleteItem(id: string) {
    await this.mutate(async (r) => {
      const item = await r.item(id);
      if (item.assignments.length || item.installedIn.length)
        throw new AppError(
          409,
          'Release this hardware from projects and computers before deleting it.',
        );
      await r.run('DELETE FROM inventory_items WHERE id=@id AND userId=@userId', { id });
    });
  }
  async locations(): Promise<Location[]> {
    return this.query(
      'SELECT l.id,l.name,l.description,COUNT(i.id) itemCount FROM locations l LEFT JOIN inventory_items i ON i.locationId=l.id WHERE l.userId=@userId GROUP BY l.id,l.name,l.description ORDER BY l.name',
    );
  }
  async saveLocation(
    name: string,
    description: string,
    id: string = randomUUID(),
    update = false,
  ): Promise<Location> {
    return this.mutate(async (r) => {
      if (update && !(await r.locations()).some((l) => l.id === id))
        throw new AppError(404, 'Location not found.');
      if (
        (
          await r.query(
            'SELECT id FROM locations WHERE userId=@userId AND name=@name AND id<>@id',
            { name, id },
          )
        ).length
      )
        throw new AppError(409, 'A location with this name already exists.');
      if (update)
        await r.run(
          'UPDATE locations SET name=@name,description=@description WHERE id=@id AND userId=@userId',
          { name, description, id },
        );
      else
        await r.run(
          'INSERT INTO locations(id,userId,name,description) VALUES (@id,@userId,@name,@description)',
          { name, description, id },
        );
      return (await r.locations()).find((l) => l.id === id)!;
    });
  }
  async deleteLocation(id: string) {
    await this.mutate(async (r) => {
      if (!(await r.locations()).some((l) => l.id === id))
        throw new AppError(404, 'Location not found.');
      await r.run(
        'UPDATE inventory_items SET locationId=NULL WHERE userId=@userId AND locationId=@id; DELETE FROM locations WHERE userId=@userId AND id=@id',
        { id },
      );
    });
  }
  async projects(): Promise<Project[]> {
    const assignments = await this.assignments();
    const projects = await this.query<Project>(
      'SELECT * FROM projects WHERE userId=@userId ORDER BY createdAt DESC',
    );
    const requirements = await this.query<RequirementRow>(
      'SELECT r.* FROM project_requirements r JOIN projects p ON p.id=r.projectId WHERE p.userId=@userId ORDER BY r.id',
    );
    return projects.map((p) => ({
      ...p,
      assignments: assignments.filter((a) => a.projectId === p.id),
      requirements: requirements.filter((r) => r.projectId === p.id).map(decode),
    }));
  }
  async project(id: string) {
    const project = (await this.projects()).find((p) => p.id === id);
    if (!project) throw new AppError(404, 'Project not found.');
    return project;
  }
  async saveProject(
    input: ProjectInput,
    id: string = randomUUID(),
    update = false,
  ): Promise<Project> {
    return this.mutate(async (r) => {
      if (update) await r.project(id);
      const { requirements, ...fields } = input;
      if (update)
        await r.run(
          'UPDATE projects SET name=@name,description=@description,status=@status,notes=@notes,estimatedCostCents=@estimatedCostCents WHERE id=@id AND userId=@userId',
          { ...fields, id },
        );
      else
        await r.run(
          'INSERT INTO projects(id,userId,name,description,status,notes,estimatedCostCents) VALUES (@id,@userId,@name,@description,@status,@notes,@estimatedCostCents)',
          { ...fields, id },
        );
      await r.run('DELETE FROM project_requirements WHERE projectId=@id', { id });
      for (const requirement of requirements)
        await r.run(
          'INSERT INTO project_requirements(id,projectId,name,categories,tags,quantity,optional,estimatedUnitCostCents) VALUES (@id,@projectId,@name,@categories,@tags,@quantity,@optional,@estimatedUnitCostCents)',
          {
            ...requirement,
            id: randomUUID(),
            projectId: id,
            categories: JSON.stringify(requirement.categories),
            tags: JSON.stringify(requirement.tags),
          },
        );
      if (input.status === 'Abandoned')
        await r.run('DELETE FROM project_assignments WHERE projectId=@id AND userId=@userId', {
          id,
        });
      return r.project(id);
    });
  }
  async deleteProject(id: string) {
    await this.mutate(async (r) => {
      await r.project(id);
      await r.run('DELETE FROM projects WHERE id=@id AND userId=@userId', { id });
    });
  }
  async assign(projectId: string, itemId: string, quantity: number): Promise<Project> {
    return this.mutate(async (r) => {
      if ((await r.project(projectId)).status === 'Abandoned')
        throw new AppError(409, 'Reopen this project before assigning hardware.');
      const item = await r.item(itemId);
      if (quantity > item.availableQuantity)
        throw new AppError(
          409,
          `Only ${item.availableQuantity} units are available. Refresh your deck and try again.`,
        );
      await r.run(
        'IF EXISTS(SELECT 1 FROM project_assignments WHERE projectId=@projectId AND itemId=@itemId) UPDATE project_assignments SET quantity=quantity+@quantity WHERE projectId=@projectId AND itemId=@itemId AND userId=@userId; ELSE INSERT INTO project_assignments(id,userId,projectId,itemId,quantity) VALUES (@id,@userId,@projectId,@itemId,@quantity);',
        { id: randomUUID(), projectId, itemId, quantity },
      );
      return r.project(projectId);
    });
  }
  async release(projectId: string, assignmentId: string) {
    await this.mutate(async (r) => {
      await r.project(projectId);
      if (
        !(await r.run(
          'DELETE FROM project_assignments WHERE id=@id AND projectId=@projectId AND userId=@userId',
          { id: assignmentId, projectId },
        ))
      )
        throw new AppError(404, 'Assignment not found.');
    });
  }
  async install(systemId: string, itemId: string, quantity: number) {
    return this.mutate(async (r) => {
      assertInstall(await r.item(systemId), await r.item(itemId), quantity);
      await r.run(
        'IF EXISTS(SELECT 1 FROM system_components WHERE systemId=@systemId AND itemId=@itemId AND userId=@userId) UPDATE system_components SET quantity=quantity+@quantity WHERE systemId=@systemId AND itemId=@itemId AND userId=@userId; ELSE INSERT INTO system_components(id,userId,systemId,itemId,quantity) VALUES (@id,@userId,@systemId,@itemId,@quantity)',
        { id: randomUUID(), systemId, itemId, quantity },
      );
      return r.item(systemId);
    });
  }
  async uninstall(systemId: string, componentId: string) {
    await this.mutate(async (r) => {
      assertEditableSystem(await r.item(systemId));
      if (
        !(await r.run(
          'DELETE FROM system_components WHERE id=@componentId AND systemId=@systemId AND userId=@userId',
          { systemId, componentId },
        ))
      )
        throw new AppError(404, 'Installed part not found.');
    });
  }
  async templates(): Promise<ProjectTemplate[]> {
    const [templates, requirements] = await Promise.all([
      this.query<ProjectTemplate>('SELECT * FROM project_templates ORDER BY name'),
      this.query<RequirementRow>('SELECT * FROM template_requirements ORDER BY id'),
    ]);
    return templates.map((t) => ({
      ...t,
      requirements: requirements.filter((r) => r.templateId === t.id).map(decode),
    }));
  }
}
