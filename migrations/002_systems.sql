ALTER TABLE inventory_items ADD COLUMN kind TEXT NOT NULL DEFAULT 'Component' CHECK(kind IN ('Component','System'));
ALTER TABLE inventory_items ADD COLUMN systemSpecs TEXT CHECK(systemSpecs IS NULL OR json_valid(systemSpecs));
CREATE TABLE system_components (
 id TEXT PRIMARY KEY, userId TEXT NOT NULL, systemId TEXT NOT NULL, itemId TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity>0), CHECK(systemId<>itemId), UNIQUE(systemId,itemId),
 FOREIGN KEY(userId,systemId) REFERENCES inventory_items(userId,id) ON DELETE CASCADE,
 FOREIGN KEY(userId,itemId) REFERENCES inventory_items(userId,id) ON DELETE RESTRICT
);
CREATE INDEX system_components_item ON system_components(userId,itemId);
