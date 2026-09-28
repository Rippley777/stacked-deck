import type {
  User,
  Assignment,
  InventoryItem,
  Location,
  Project,
  ProjectTemplate,
} from '../shared/types.js';
import type { ItemInput, ProjectInput } from '../shared/validation.js';
export type Awaitable<T> = T | Promise<T>;
export interface UserRepository {
  assignments(): Awaitable<Assignment[]>;
  inventory(): Awaitable<InventoryItem[]>;
  item(id: string): Awaitable<InventoryItem>;
  saveItem(input: ItemInput, id?: string, update?: boolean): Awaitable<InventoryItem>;
  deleteItem(id: string): Awaitable<void>;
  locations(): Awaitable<Location[]>;
  saveLocation(
    name: string,
    description: string,
    id?: string,
    update?: boolean,
  ): Awaitable<Location>;
  deleteLocation(id: string): Awaitable<void>;
  projects(): Awaitable<Project[]>;
  project(id: string): Awaitable<Project>;
  saveProject(input: ProjectInput, id?: string, update?: boolean): Awaitable<Project>;
  deleteProject(id: string): Awaitable<void>;
  assign(projectId: string, itemId: string, quantity: number): Awaitable<Project>;
  release(projectId: string, assignmentId: string): Awaitable<void>;
  templates(): Awaitable<ProjectTemplate[]>;
}
export interface AppStore {
  repository(userId: string): UserRepository;
  categories(userId: string): Awaitable<string[]>;
  health(): Awaitable<void>;
  insertUser(name: string, email: string, passwordHash: string): Awaitable<User>;
  identity(email: string): Awaitable<(User & { passwordHash: string }) | undefined>;
  sessionUser(tokenHash: string, now: number): Awaitable<User | undefined>;
  deleteSession(tokenHash: string): Awaitable<void>;
  insertSession(tokenHash: string, userId: string, expiresAt: number, now: number): Awaitable<void>;
  close(): Awaitable<void>;
}
