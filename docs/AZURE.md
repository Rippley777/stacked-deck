# Free Azure deployment

Stacked Deck's Azure deployment uses **Linux App Service F1** for the React/Express application and **Azure SQL Database's free offer** for durable data. Azure SQL is selected because App Service's network filesystem does not support the locking required by SQLite. Local development still defaults to SQLite.

## What “free” means

- [App Service F1](https://azure.microsoft.com/en-us/pricing/details/app-service/linux/) uses shared compute, offers 60 CPU minutes/day and 1 GB storage, and is intended for trials and personal testing. There is no SLA. The app can sleep when idle and is unavailable if its daily quota is exhausted.
- [Azure SQL's free offer](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer?view=azuresql) provides 100,000 vCore-seconds/month and 32 GB each of data and backup storage. This deployment sets **`useFreeLimit=true` and `freeLimitExhaustionBehavior=AutoPause`**: it pauses for the rest of the month rather than billing for database overages.
- No container registry, storage account, Application Insights, private endpoint, custom domain, or paid hosting tier is created. Resource creation failures stop the script; it never upgrades to a paid plan.
- SQL has an idle auto-pause delay of 60 minutes. Its connection pool drops idle connections after 15 seconds. Occasional usage can still consume an hour of SQL uptime before auto-pause; watch the **Free amount remaining** metric. Continuous health polling would prevent auto-pause, so do not add an always-on uptime monitor on this free deployment.
- These choices govern the app's resources. They do not change or cancel other resources already billed in your subscription.

## Deploy

Prerequisites: Node 24, Azure CLI, Docker, an Azure subscription with F1 capacity and SQL free-offer availability, and an Azure user allowed to create resources and act as SQL's Microsoft Entra administrator.

```sh
nvm install
nvm use
npm ci
az login
az bicep install
npm run deploy:azure -- stacked-deck-your-unique-name
```

Choose a lowercase globally unique name (4–40 characters). If omitted, the script derives a stable name from your subscription ID. It creates a dedicated `rg-<app-name>` resource group. The script selects your existing SQL free-offer region when one is already assigned, otherwise Central US. You can set `AZURE_LOCATION` and `AZURE_RESOURCE_GROUP`; the script refuses a different region if your subscription already has a free-offer SQL region.

The deployment:

1. Builds the application and native dependencies in a **Linux x64 Node 24** container, then creates a zip containing only production code/dependencies and migrations. `.env`, local databases, demo passwords, and local accounts are excluded.
2. Creates an F1 plan, a Node web app with a system-assigned managed identity, a dedicated SQL logical server and a free-offer database with overage auto-pause.
3. Verifies the actual plan/database pricing settings before publishing.
4. Allows the web app's current and possible outbound IPs through SQL's firewall. It adds a temporary rule for the machine performing deployment, grants the app identity database reader/writer/DDL roles, and removes that temporary rule in a `finally` block.
5. Uploads the package and checks `/api/health` over HTTPS.

The resulting URL and resource names are recorded in **`data/azure-deployment.json`** (ignored by Git). Create a new account on the deployed site. Existing local users and demo inventory are not uploaded.

If the app's outbound IPs change due to Azure platform changes or a hosting-plan move, rerun deployment to update SQL firewall rules.

## Configuration

App Service settings are supplied by `deploy/azure/main.bicep`:

| Setting                    | Value                                                             |
| -------------------------- | ----------------------------------------------------------------- |
| `NODE_ENV`                 | `production`                                                      |
| `APP_ORIGIN`               | The web app's actual HTTPS default hostname                       |
| `DATABASE_PROVIDER`        | `sqlserver`                                                       |
| `AZURE_SQL_SERVER`         | Dedicated server's `*.database.windows.net` hostname              |
| `AZURE_SQL_DATABASE`       | `stacked-deck`                                                    |
| `TRUST_PROXY`              | `1`                                                               |
| `WEBSITE_RUN_FROM_PACKAGE` | `1`                                                               |
| Build settings             | Azure-side builds disabled; the uploaded package is already built |

Azure supplies `PORT`. The backend accepts it and binds to `0.0.0.0`. TLS terminates at App Service; production cookies remain Secure/HTTP-only.

There are **no database passwords** in application settings. The SQL driver uses Microsoft's default Azure credential chain: App Service managed identity in Azure, your Azure CLI identity when testing locally. SQL authentication is disabled on the dedicated server.

The database schema is migrated transactionally at startup using `migrations/sqlserver/`. All mutations acquire a per-user transaction lock to preserve reservation limits, including across concurrent requests. Templates are updated under a separate schema/template lock.

## Validate

```sh
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
```

The SQL integration test is opt-in and uses isolated disposable accounts. To run it locally, allow your workstation IP through the dedicated SQL server firewall temporarily, then set:

```sh
DATABASE_PROVIDER=sqlserver \
AZURE_SQL_SERVER=<server>.database.windows.net \
AZURE_SQL_DATABASE=stacked-deck \
npm run test:sqlserver
```

It verifies real SQL migrations, account isolation, foreign-key ownership, tags, quantities, concurrent reservations, compatibility, valuation, release, deletion and logout. It cleans up its test accounts. Remove the workstation firewall rule afterward.

To test the deployed UI with Chromium:

```sh
PLAYWRIGHT_BASE_URL=https://<actual-default-hostname> npm run test:e2e
```

This creates a private test account on that server; it is not a demo-seeding command. `PLAYWRIGHT_TEST_EMAIL` can specify its exact email for cleanup. The remote test does not start a local web server.

## Operations

- Redeploy using the same app name. The package is replaced while data remains in Azure SQL.
- Monitor App Service CPU quota and the database's free compute/storage allowance in Azure Portal.
- Use SQL's managed point-in-time restore (up to seven days for the no-overage free offer). Local `db:backup` applies to SQLite only and rejects the SQL provider.
- Do not enable **Continue using database for additional charges**, change the F1 plan, enable Always On, or add paid auxiliary services if you want to retain this free configuration.
- If a deployment fails, inspect the recorded resource names and Azure logs. Partial deployments can leave the dedicated resources created. They stay within the configured free tiers; repair using the same app name.
- To remove the application, delete its dedicated resource group in Azure Portal after exporting any data you need. This permanently deletes the app and its database.

Sources: [App Service Node deployment](https://learn.microsoft.com/en-us/azure/app-service/quickstart-nodejs), [App Service SQLite limitation](https://learn.microsoft.com/en-us/troubleshoot/azure/app-service/faqs-app-service-linux-new), [Azure SQL free offer](https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer?view=azuresql).
