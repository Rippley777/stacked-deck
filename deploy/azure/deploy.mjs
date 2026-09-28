import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
process.chdir(root);
function command(program, args, json = false) {
  try {
    const output = execFileSync(program, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 16 * 1024 * 1024,
    });
    return json ? JSON.parse(output) : output.trim();
  } catch (error) {
    process.stderr.write(error.stderr || error.message);
    throw new Error(`${program} failed. Deployment stopped; there is no paid-tier fallback.`, {
      cause: error,
    });
  }
}
const az = (args, json = true) =>
  command('az', [...args, '--only-show-errors', '-o', json ? 'json' : 'tsv'], json);
const account = az(['account', 'show']);
const administrator = az(['ad', 'signed-in-user', 'show']);
const appName =
  process.argv[2] ||
  `stacked-deck-${createHash('sha256').update(account.id).digest('hex').slice(0, 8)}`;
if (!/^[a-z][a-z0-9-]{3,39}$/.test(appName))
  throw new Error(
    'Use a lowercase app name, 4–40 characters, containing letters, numbers and hyphens.',
  );
const resourceGroup = process.env.AZURE_RESOURCE_GROUP || `rg-${appName}`;
// All free-offer SQL databases in a subscription must use the same region.
let freeRegion;
for (const server of az(['sql', 'server', 'list'])) {
  if (
    az(['sql', 'db', 'list', '-g', server.resourceGroup, '-s', server.name]).some(
      (db) => db.useFreeLimit,
    )
  ) {
    freeRegion = server.location;
    break;
  }
}
const location = process.env.AZURE_LOCATION || freeRegion || 'centralus';
if (freeRegion && location !== freeRegion)
  throw new Error(
    `Your subscription's SQL free-offer region is ${freeRegion}. Set AZURE_LOCATION=${freeRegion}.`,
  );
const artifacts = resolve('data/azure-artifact');
mkdirSync(artifacts, { recursive: true });
console.log(
  'Building a Linux x64 Node 24 deployment package (no local secrets or database included)…',
);
command('docker', [
  'build',
  '--platform',
  'linux/amd64',
  '-f',
  'deploy/azure/Dockerfile.package',
  '--output',
  `type=local,dest=${artifacts}`,
  '.',
]);
const expectedIndex = command('unzip', [
  '-p',
  resolve(artifacts, 'stacked-deck.zip'),
  'dist/client/index.html',
]);
const expectedRelease = createHash('sha256')
  .update(command('unzip', ['-p', resolve(artifacts, 'stacked-deck.zip'), 'dist/server/app.js']))
  .digest('hex')
  .slice(0, 16);
console.log(
  `Provisioning ${appName} in ${location}: F1 hosting and SQL free offer with AutoPause…`,
);
az(['group', 'create', '-n', resourceGroup, '-l', location, '--tags', 'application=stacked-deck']);
const result = az([
  'deployment',
  'group',
  'create',
  '-g',
  resourceGroup,
  '-n',
  'stacked-deck-free',
  '--template-file',
  'deploy/azure/main.bicep',
  '--parameters',
  `appName=${appName}`,
  `administratorObjectId=${administrator.id}`,
  `administratorName=${administrator.displayName}`,
  '--query',
  'properties.outputs',
]);
const outputs = Object.fromEntries(
  Object.entries(result).map(([key, output]) => [key, output.value]),
);
const database = az([
  'sql',
  'db',
  'show',
  '-g',
  resourceGroup,
  '-s',
  outputs.sqlServerName,
  '-n',
  outputs.databaseName,
]);
const plan = az(['appservice', 'plan', 'show', '-g', resourceGroup, '-n', `${appName}-hosting`]);
if (
  plan.sku.name !== 'F1' ||
  !database.useFreeLimit ||
  database.freeLimitExhaustionBehavior !== 'AutoPause'
)
  throw new Error(
    'Free-tier settings could not be verified. Deployment stopped; inspect the resources before continuing.',
  );
const state = { resourceGroup, location, ...outputs };
writeFileSync(resolve('data/azure-deployment.json'), JSON.stringify(state, null, 2));
const web = az(['webapp', 'show', '-g', resourceGroup, '-n', appName]);
const addresses = [
  ...new Set(
    [web.outboundIpAddresses, web.possibleOutboundIpAddresses]
      .filter(Boolean)
      .join(',')
      .split(',')
      .filter(Boolean),
  ),
];
console.log('Allowing the app outbound IPs and temporary deployment access to SQL…');
for (const [index, address] of addresses.entries())
  az([
    'sql',
    'server',
    'firewall-rule',
    'create',
    '-g',
    resourceGroup,
    '-s',
    outputs.sqlServerName,
    '-n',
    `stacked-deck-app-${index}`,
    '--start-ip-address',
    address,
    '--end-ip-address',
    address,
  ]);
const deploymentAddress = command('curl', ['-fsS', 'https://api.ipify.org']);
if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(deploymentAddress))
  throw new Error('Could not determine deployment IPv4 address.');
const firewallArgs = [
  '-g',
  resourceGroup,
  '-s',
  outputs.sqlServerName,
  '-n',
  'stacked-deck-deployer',
];
az([
  'sql',
  'server',
  'firewall-rule',
  'create',
  ...firewallArgs,
  '--start-ip-address',
  deploymentAddress,
  '--end-ip-address',
  deploymentAddress,
]);
try {
  console.log('Configuring passwordless database access for the app managed identity…');
  console.log(
    command(process.execPath, [
      'deploy/azure/grant-access.mjs',
      outputs.sqlHostname,
      outputs.databaseName,
      outputs.principalId,
    ]),
  );
  console.log('Publishing the application…');
  az([
    'webapp',
    'deploy',
    '-g',
    resourceGroup,
    '-n',
    appName,
    '--src-path',
    resolve(artifacts, 'stacked-deck.zip'),
    '--type',
    'zip',
    '--clean',
    'true',
    '--restart',
    'true',
    '--track-status',
    'false',
    '--timeout',
    '600000',
  ]);
  // Upload completion can precede the worker switching its mounted package.
  az(['webapp', 'restart', '-g', resourceGroup, '-n', appName]);
  let healthy = false;
  let lastStatus = 'not reachable';
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const response = await fetch(`${outputs.url}/api/health`, {
        signal: AbortSignal.timeout(30000),
      });
      lastStatus = response.ok
        ? 'waiting for the published server release'
        : `HTTP ${response.status}`;
      if (response.ok && (await response.json()).release === expectedRelease) {
        const page = await fetch(outputs.url, { signal: AbortSignal.timeout(30000) });
        if (page.ok && (await page.text()).trim() === expectedIndex) {
          healthy = true;
          break;
        }
        lastStatus = 'waiting for the published client assets';
      }
    } catch (error) {
      lastStatus = error.message;
    }
    console.log(`Waiting for Azure startup (${lastStatus})…`);
    await new Promise((resolve) => setTimeout(resolve, 15000));
  }
  if (!healthy)
    throw new Error(`Deployment health check failed (${lastStatus}). Inspect Azure logs.`);
  console.log(`Deployment healthy: ${outputs.url}`);
  console.log(
    'Create an account on the deployed site. Local accounts and demo inventory were not uploaded.',
  );
} finally {
  az(['sql', 'server', 'firewall-rule', 'delete', ...firewallArgs], false);
}
