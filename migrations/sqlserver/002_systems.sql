ALTER TABLE inventory_items ADD kind nvarchar(16) NOT NULL CONSTRAINT inventory_kind_default DEFAULT 'Component' CONSTRAINT inventory_kind_check CHECK(kind IN ('Component','System'));
ALTER TABLE inventory_items ADD systemSpecs nvarchar(max) NULL CONSTRAINT inventory_specs_json CHECK(systemSpecs IS NULL OR ISJSON(systemSpecs)=1);
CREATE TABLE system_components (
 id nvarchar(36) NOT NULL PRIMARY KEY, userId nvarchar(36) NOT NULL, systemId nvarchar(36) NOT NULL, itemId nvarchar(36) NOT NULL,
 quantity int NOT NULL CHECK(quantity>0), CHECK(systemId<>itemId), UNIQUE(systemId,itemId),
 FOREIGN KEY(userId,systemId) REFERENCES inventory_items(userId,id) ON DELETE CASCADE,
 FOREIGN KEY(userId,itemId) REFERENCES inventory_items(userId,id)
);
CREATE INDEX system_components_item ON system_components(userId,itemId);
