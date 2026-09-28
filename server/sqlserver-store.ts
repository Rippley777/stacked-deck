import sql from 'mssql';
import { randomUUID, createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AppStore } from './store.js';
import { defaultCategories, type User } from '../shared/types.js';
import { AppError } from './errors.js';
import { templates } from './templates.js';
import { SqlServerRepository } from './sqlserver-repository.js';
export type SqlParameters = Record<string, string | number | boolean | null>;
export type SqlConnection = sql.ConnectionPool | sql.Transaction;
export function bind(connection: SqlConnection, parameters: SqlParameters = {}) {
  const request =
    connection instanceof sql.Transaction
      ? new sql.Request(connection)
      : new sql.Request(connection);
  for (const [name, value] of Object.entries(parameters)) {
    if (typeof value === 'number')
      request.input(name, Math.abs(value) > 2147483647 ? sql.BigInt : sql.Int, value);
    else if (typeof value === 'boolean') request.input(name, sql.Bit, value);
    else request.input(name, sql.NVarChar(sql.MAX), value);
  }
  return request;
}
export async function rows<T>(
  connection: SqlConnection,
  statement: string,
  parameters: SqlParameters = {},
): Promise<T[]> {
  return (await bind(connection, parameters).query(statement)).recordset as T[];
}
export async function execute(
  connection: SqlConnection,
  statement: string,
  parameters: SqlParameters = {},
) {
  return (await bind(connection, parameters).query(statement)).rowsAffected.reduce(
    (n, count) => n + count,
    0,
  );
}
export class SqlServerStore implements AppStore {
  constructor(public pool: sql.ConnectionPool) {
    pool.on('error', (error) => console.error('Database connection:', error.message));
  }
  async transaction<T>(
    key: string,
    callback: (connection: sql.Transaction) => Promise<T>,
  ): Promise<T> {
    const transaction = new sql.Transaction(this.pool);
    await transaction.begin(sql.ISOLATION_LEVEL.READ_COMMITTED);
    let rolledBack = false;
    transaction.on('rollback', () => {
      rolledBack = true;
    });
    try {
      const resource = `stacked-deck:${createHash('sha256').update(key).digest('hex')}`;
      await execute(
        transaction,
        "DECLARE @result int; EXEC @result=sys.sp_getapplock @Resource=@resource, @LockMode='Exclusive', @LockOwner='Transaction', @LockTimeout=10000; IF @result<0 THROW 51000, 'Could not acquire application lock.', 1;",
        { resource },
      );
      const result = await callback(transaction);
      await transaction.commit();
      return result;
    } catch (error) {
      if (!rolledBack) await transaction.rollback();
      throw error;
    }
  }
  async initialize() {
    await this.transaction('schema-and-templates', async (connection) => {
      await execute(
        connection,
        "IF OBJECT_ID(N'schema_migrations',N'U') IS NULL CREATE TABLE schema_migrations(name nvarchar(160) NOT NULL PRIMARY KEY, appliedAt datetime2 NOT NULL DEFAULT SYSUTCDATETIME());",
      );
      for (const name of readdirSync(resolve('migrations/sqlserver'))
        .filter((name) => name.endsWith('.sql'))
        .sort()) {
        if (
          !(await rows(connection, 'SELECT name FROM schema_migrations WHERE name=@name', { name }))
            .length
        ) {
          await new sql.Request(connection).batch(
            readFileSync(resolve('migrations/sqlserver', name), 'utf8'),
          );
          await execute(connection, 'INSERT INTO schema_migrations(name) VALUES (@name)', { name });
        }
      }
      for (const t of templates) {
        const { requirements, ...fields } = t;
        await execute(
          connection,
          'IF EXISTS(SELECT 1 FROM project_templates WHERE id=@id) UPDATE project_templates SET name=@name,description=@description,difficulty=@difficulty,duration=@duration,icon=@icon,accent=@accent,caveat=@caveat WHERE id=@id; ELSE INSERT INTO project_templates(id,name,description,difficulty,duration,icon,accent,caveat) VALUES (@id,@name,@description,@difficulty,@duration,@icon,@accent,@caveat);',
          fields,
        );
        await execute(connection, 'DELETE FROM template_requirements WHERE templateId=@id', {
          id: t.id,
        });
        for (const [index, r] of requirements.entries())
          await execute(
            connection,
            'INSERT INTO template_requirements(id,templateId,name,categories,tags,quantity,optional,estimatedUnitCostCents) VALUES (@id,@templateId,@name,@categories,@tags,@quantity,@optional,@estimatedUnitCostCents)',
            {
              ...r,
              id: `${t.id}-${index}`,
              templateId: t.id,
              categories: JSON.stringify(r.categories),
              tags: JSON.stringify(r.tags),
            },
          );
      }
    });
  }
  repository(userId: string) {
    return new SqlServerRepository(this, userId);
  }
  async health() {
    await rows(this.pool, 'SELECT 1 alive');
  }
  async categories(userId: string) {
    return (
      await rows<{ name: string }>(
        this.pool,
        'SELECT name FROM categories WHERE userId=@userId ORDER BY name',
        { userId },
      )
    ).map((r) => r.name);
  }
  async insertUser(name: string, email: string, passwordHash: string): Promise<User> {
    return this.transaction(`identity:${email}`, async (connection) => {
      if ((await rows(connection, 'SELECT id FROM users WHERE email=@email', { email })).length)
        throw new AppError(409, 'An account with this email already exists.');
      const id = randomUUID();
      await execute(connection, 'INSERT INTO users(id,name,email) VALUES (@id,@name,@email)', {
        id,
        name,
        email,
      });
      await execute(
        connection,
        "INSERT INTO identities(id,userId,provider,subject,passwordHash) VALUES (@identityId,@id,'password',@email,@passwordHash)",
        { identityId: randomUUID(), id, email, passwordHash },
      );
      for (const categoryName of defaultCategories)
        await execute(connection, 'INSERT INTO categories(userId,name) VALUES (@id,@name)', {
          id,
          name: categoryName,
        });
      return { id, name, email };
    });
  }
  async identity(email: string) {
    return (
      await rows<User & { passwordHash: string }>(
        this.pool,
        "SELECT u.id,u.name,u.email,i.passwordHash FROM users u JOIN identities i ON i.userId=u.id WHERE i.provider='password' AND i.subject=@email",
        { email },
      )
    )[0];
  }
  async sessionUser(tokenHash: string, now: number) {
    return (
      await rows<User>(
        this.pool,
        'SELECT u.id,u.name,u.email FROM users u JOIN sessions s ON s.userId=u.id WHERE s.tokenHash=@tokenHash AND s.expiresAt>@now',
        { tokenHash, now },
      )
    )[0];
  }
  async deleteSession(tokenHash: string) {
    await execute(this.pool, 'DELETE FROM sessions WHERE tokenHash=@tokenHash', { tokenHash });
  }
  async insertSession(tokenHash: string, userId: string, expiresAt: number, now: number) {
    await execute(
      this.pool,
      'DELETE FROM sessions WHERE expiresAt<=@now; INSERT INTO sessions(tokenHash,userId,expiresAt) VALUES (@tokenHash,@userId,@expiresAt)',
      { tokenHash, userId, expiresAt, now },
    );
  }
  async close() {
    await this.pool.close();
  }
}
export async function openSqlServerStore(configuration?: sql.config) {
  const server = process.env.AZURE_SQL_SERVER;
  const database = process.env.AZURE_SQL_DATABASE;
  if (!configuration && (!server || !database))
    throw new Error(
      'AZURE_SQL_SERVER and AZURE_SQL_DATABASE are required for the sqlserver provider.',
    );
  const pool = new sql.ConnectionPool(
    configuration || {
      server: server!,
      database: database!,
      authentication: { type: 'azure-active-directory-default', options: {} },
      options: { encrypt: true, trustServerCertificate: false, abortTransactionOnError: true },
      connectionTimeout: 120000,
      requestTimeout: 30000,
      pool: { max: 5, min: 0, idleTimeoutMillis: 15000 },
    },
  );
  try {
    await pool.connect();
    const store = new SqlServerStore(pool);
    await store.initialize();
    return store;
  } catch (error) {
    await pool.close();
    throw error;
  }
}
