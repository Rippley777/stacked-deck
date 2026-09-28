import sql from 'mssql';
import { execFileSync } from 'node:child_process';
const [server, database, principalId] = process.argv.slice(2);
if (!server || !database || !/^[0-9a-f-]{36}$/i.test(principalId || ''))
  throw new Error(
    'Usage: node deploy/azure/grant-access.mjs <sql-hostname> <database> <app-principal-id>',
  );
const token = execFileSync(
  'az',
  [
    'account',
    'get-access-token',
    '--resource',
    'https://database.windows.net/',
    '--query',
    'accessToken',
    '-o',
    'tsv',
  ],
  { encoding: 'utf8' },
).trim();
// SQL service-principal SIDs use the application's client ID, not its object ID.
const clientId = execFileSync(
  'az',
  ['ad', 'sp', 'show', '--id', principalId, '--query', 'appId', '-o', 'tsv'],
  { encoding: 'utf8' },
).trim();
if (!/^[0-9a-f-]{36}$/i.test(clientId)) throw new Error('Could not resolve identity client ID.');
const pool = await new sql.ConnectionPool({
  server,
  database,
  authentication: { type: 'azure-active-directory-access-token', options: { token } },
  options: { encrypt: true, trustServerCertificate: false },
  connectionTimeout: 120000,
  requestTimeout: 30000,
}).connect();
try {
  await pool.request().input('clientId', sql.UniqueIdentifier, clientId).query(`
    IF EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'stacked_deck_app' AND sid<>CAST(@clientId AS varbinary(16)))
      DROP USER [stacked_deck_app];
    IF NOT EXISTS(SELECT 1 FROM sys.database_principals WHERE name=N'stacked_deck_app')
    BEGIN
      DECLARE @sid varchar(34) = CONVERT(varchar(34),CAST(@clientId AS varbinary(16)),1);
      DECLARE @statement nvarchar(500) = N'CREATE USER [stacked_deck_app] WITH SID=' + @sid + N', TYPE=E';
      EXEC sys.sp_executesql @statement;
    END;
    ALTER ROLE db_datareader ADD MEMBER [stacked_deck_app];
    ALTER ROLE db_datawriter ADD MEMBER [stacked_deck_app];
    ALTER ROLE db_ddladmin ADD MEMBER [stacked_deck_app];
  `);
  console.log('Granted the web app managed identity access to its application database.');
} finally {
  await pool.close();
}
