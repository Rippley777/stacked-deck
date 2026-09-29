ALTER TABLE inventory_items ADD aiValuation TEXT NULL CHECK(aiValuation IS NULL OR json_valid(aiValuation));
ALTER TABLE inventory_items ADD manualValueOverrideCents INTEGER NULL CHECK(manualValueOverrideCents >= 0);
ALTER TABLE inventory_items ADD valuationUpdatedAt TEXT NULL;
UPDATE inventory_items SET manualValueOverrideCents=estimatedValueCents, valuationUpdatedAt=CASE WHEN estimatedValueCents IS NOT NULL THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE NULL END;
CREATE TABLE equipment_valuations (
 id TEXT NOT NULL PRIMARY KEY, userId TEXT NOT NULL, itemId TEXT NOT NULL,
 valuation TEXT NULL CHECK(valuation IS NULL OR json_valid(valuation)), effectiveValueCents INTEGER NULL CHECK(effectiveValueCents>=0),
 source TEXT NOT NULL CHECK(source IN ('ai','manual')), provider TEXT NOT NULL,
 inputFingerprint TEXT NOT NULL DEFAULT '',
 createdAt TEXT NOT NULL, appliedAt TEXT NULL,
 FOREIGN KEY(userId,itemId) REFERENCES inventory_items(userId,id) ON DELETE CASCADE
);
CREATE INDEX valuations_item_date ON equipment_valuations(userId,itemId,createdAt);
-- Per-item contribution events preserve historical holdings, including deleted cards.
-- itemId is a historical identifier, deliberately not a live inventory foreign key.
CREATE TABLE portfolio_value_events (
 sequence INTEGER PRIMARY KEY AUTOINCREMENT,
 userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 itemId TEXT NOT NULL, valueCents INTEGER NOT NULL CHECK(valueCents>=0), createdAt TEXT NOT NULL
);
CREATE INDEX portfolio_events_owner_sequence ON portfolio_value_events(userId,sequence);
INSERT INTO equipment_valuations(id,userId,itemId,valuation,effectiveValueCents,source,provider,createdAt,appliedAt)
SELECT lower(hex(randomblob(16))),userId,id,NULL,estimatedValueCents,'manual','legacy',strftime('%Y-%m-%dT%H:%M:%fZ','now'),strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM inventory_items WHERE estimatedValueCents IS NOT NULL;
INSERT INTO portfolio_value_events(userId,itemId,valueCents,createdAt)
SELECT i.userId,i.id,
 CASE WHEN i.status IN ('Sold','Archived') THEN 0 ELSE
 (i.quantity-COALESCE((SELECT SUM(c.quantity) FROM system_components c WHERE c.itemId=i.id),0)) *
 (COALESCE(i.estimatedValueCents, CASE WHEN i.kind='System' THEN (SELECT SUM(p.estimatedValueCents*c.quantity) FROM system_components c JOIN inventory_items p ON p.id=c.itemId WHERE c.systemId=i.id) ELSE 0 END,0)) END,
 strftime('%Y-%m-%dT%H:%M:%fZ','now') FROM inventory_items i;
