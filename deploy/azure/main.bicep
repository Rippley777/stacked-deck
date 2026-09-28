targetScope = 'resourceGroup'

@description('Globally unique web app name. All resources are dedicated to this application.')
param appName string
param location string = resourceGroup().location
param administratorObjectId string
param administratorName string
param databaseName string = 'stacked-deck'

var serverName = '${appName}-sql'

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: '${appName}-hosting'
  location: location
  kind: 'linux'
  sku: { name: 'F1', tier: 'Free' }
  properties: { reserved: true }
}

resource web 'Microsoft.Web/sites@2024-04-01' = {
  name: appName
  location: location
  kind: 'app,linux'
  identity: { type: 'SystemAssigned' }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|24-lts'
      appCommandLine: 'node dist/server/index.js'
      alwaysOn: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

resource sqlServer 'Microsoft.Sql/servers@2023-08-01' = {
  name: serverName
  location: location
  properties: {
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
    administrators: {
      administratorType: 'ActiveDirectory'
      principalType: 'User'
      login: administratorName
      sid: administratorObjectId
      tenantId: subscription().tenantId
      azureADOnlyAuthentication: true
    }
  }
}

resource database 'Microsoft.Sql/servers/databases@2023-08-01' = {
  parent: sqlServer
  name: databaseName
  location: location
  sku: { name: 'GP_S_Gen5', tier: 'GeneralPurpose', family: 'Gen5', capacity: 2 }
  properties: {
    collation: 'Latin1_General_100_BIN2'
    maxSizeBytes: 34359738368
    // Bicep does not have floating-point literals. json() provides SQL's 0.5 minimum.
    minCapacity: json('0.5')
    autoPauseDelay: 60
    requestedBackupStorageRedundancy: 'Local'
    zoneRedundant: false
    useFreeLimit: true
    freeLimitExhaustionBehavior: 'AutoPause'
  }
}

resource settings 'Microsoft.Web/sites/config@2024-04-01' = {
  parent: web
  name: 'appsettings'
  properties: {
    NODE_ENV: 'production'
    APP_ORIGIN: 'https://${web.properties.defaultHostName}'
    DATABASE_PROVIDER: 'sqlserver'
    AZURE_SQL_SERVER: sqlServer.properties.fullyQualifiedDomainName
    AZURE_SQL_DATABASE: database.name
    TRUST_PROXY: '1'
    WEBSITE_RUN_FROM_PACKAGE: '1'
    SCM_DO_BUILD_DURING_DEPLOYMENT: 'false'
    ENABLE_ORYX_BUILD: 'false'
  }
}

output appName string = web.name
output url string = 'https://${web.properties.defaultHostName}'
output sqlServerName string = sqlServer.name
output sqlHostname string = sqlServer.properties.fullyQualifiedDomainName
output databaseName string = database.name
output principalId string = web.identity.principalId
