ALTER TABLE inventory_items ADD aiValuation nvarchar(max) NULL CHECK(aiValuation IS NULL OR ISJSON(aiValuation)=1);
ALTER TABLE inventory_items ADD manualValueOverrideCents int NULL CHECK(manualValueOverrideCents >= 0);
ALTER TABLE inventory_items ADD valuationUpdatedAt nvarchar(24) NULL;
EXEC(N'UPDATE inventory_items SET manualValueOverrideCents=estimatedValueCents, valuationUpdatedAt=CASE WHEN estimatedValueCents IS NOT NULL THEN CONVERT(varchar(23),SYSUTCDATETIME(),126)+''Z'' ELSE NULL END;');
CREATE TABLE equipment_valuations (
 id nvarchar(36) NOT NULL PRIMARY KEY, userId nvarchar(36) NOT NULL, itemId nvarchar(36) NOT NULL,
 valuation nvarchar(max) NULL CHECK(valuation IS NULL OR ISJSON(valuation)=1), effectiveValueCents int NULL CHECK(effectiveValueCents>=0),
 source nvarchar(12) NOT NULL CHECK(source IN ('ai','manual')), provider nvarchar(160) NOT NULL,
 inputFingerprint nvarchar(64) NOT NULL DEFAULT '',
 createdAt nvarchar(24) NOT NULL, appliedAt nvarchar(24) NULL,
 FOREIGN KEY(userId,itemId) REFERENCES inventory_items(userId,id) ON DELETE CASCADE
);
CREATE INDEX valuations_item_date ON equipment_valuations(userId,itemId,createdAt);
-- Per-item contribution events preserve historical holdings, including deleted cards.
-- itemId is a historical identifier, deliberately not a live inventory foreign key.
CREATE TABLE portfolio_value_events (
 sequence bigint IDENTITY(1,1) PRIMARY KEY,
 userId nvarchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 itemId nvarchar(36) NOT NULL, valueCents bigint NOT NULL CHECK(valueCents>=0), createdAt nvarchar(24) NOT NULL
);
CREATE INDEX portfolio_events_owner_sequence ON portfolio_value_events(userId,sequence);
INSERT INTO equipment_valuations(id,userId,itemId,valuation,effectiveValueCents,source,provider,createdAt,appliedAt)
SELECT CONVERT(nvarchar(36),NEWID()),userId,id,NULL,estimatedValueCents,'manual','legacy',CONVERT(varchar(23),SYSUTCDATETIME(),126)+'Z',CONVERT(varchar(23),SYSUTCDATETIME(),126)+'Z' FROM inventory_items WHERE estimatedValueCents IS NOT NULL;
INSERT INTO portfolio_value_events(userId,itemId,valueCents,createdAt)
SELECT i.userId,i.id,
 CASE WHEN i.status IN ('Sold','Archived') THEN 0 ELSE
 (i.quantity-COALESCE((SELECT SUM(c.quantity) FROM system_components c WHERE c.itemId=i.id),0)) *
 CAST(COALESCE(i.estimatedValueCents, CASE WHEN i.kind='System' THEN (SELECT SUM(CAST(p.estimatedValueCents AS bigint)*c.quantity) FROM system_components c JOIN inventory_items p ON p.id=c.itemId WHERE c.systemId=i.id) ELSE 0 END,0) AS bigint) END,
 CONVERT(varchar(23),SYSUTCDATETIME(),126)+'Z' FROM inventory_items i;
