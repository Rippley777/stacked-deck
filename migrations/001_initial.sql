CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE, createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));
CREATE TABLE identities (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider TEXT NOT NULL, subject TEXT NOT NULL, passwordHash TEXT, UNIQUE(provider, subject));
CREATE INDEX identities_user ON identities(userId);
CREATE TABLE sessions (tokenHash TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expiresAt INTEGER NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expiresAt);
CREATE INDEX sessions_user ON sessions(userId);
CREATE TABLE categories (userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, PRIMARY KEY(userId,name));
CREATE TABLE locations (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', UNIQUE(userId,name), UNIQUE(userId,id));
CREATE TABLE inventory_items (
 id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, manufacturer TEXT NOT NULL DEFAULT '', model TEXT NOT NULL DEFAULT '', category TEXT NOT NULL,
 quantity INTEGER NOT NULL CHECK(quantity > 0), condition TEXT NOT NULL CHECK(condition IN ('New','Like New','Good','Fair','For Parts')),
 status TEXT NOT NULL CHECK(status IN ('Available','In Use','Reserved','Broken','Loaned','Sold','Archived')), locationId TEXT,
 notes TEXT NOT NULL DEFAULT '', purchasePriceCents INTEGER CHECK(purchasePriceCents >= 0), purchaseDate TEXT, estimatedValueCents INTEGER CHECK(estimatedValueCents >= 0), serialNumber TEXT NOT NULL DEFAULT '', imageUrl TEXT NOT NULL DEFAULT '',
 createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), updatedAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(userId,id), FOREIGN KEY(userId,category) REFERENCES categories(userId,name), FOREIGN KEY(userId,locationId) REFERENCES locations(userId,id)
);
CREATE INDEX inventory_user_status ON inventory_items(userId,status);
CREATE INDEX inventory_user_category ON inventory_items(userId,category);
CREATE INDEX inventory_user_location ON inventory_items(userId,locationId);
CREATE INDEX inventory_user_created ON inventory_items(userId,createdAt DESC);
CREATE TABLE tags (userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, PRIMARY KEY(userId,name));
CREATE TABLE item_tags (userId TEXT NOT NULL, itemId TEXT NOT NULL, tag TEXT NOT NULL, PRIMARY KEY(itemId,tag), FOREIGN KEY(userId,itemId) REFERENCES inventory_items(userId,id) ON DELETE CASCADE, FOREIGN KEY(userId,tag) REFERENCES tags(userId,name) ON DELETE CASCADE);
CREATE INDEX tags_lookup ON item_tags(userId,tag,itemId);
CREATE TABLE projects (id TEXT PRIMARY KEY, userId TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL CHECK(status IN ('Idea','Planning','Ready','In Progress','Complete','Abandoned')), notes TEXT NOT NULL DEFAULT '', estimatedCostCents INTEGER CHECK(estimatedCostCents >= 0), createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), UNIQUE(userId,id));
CREATE INDEX projects_user_status ON projects(userId,status);
CREATE TABLE project_requirements (id TEXT PRIMARY KEY, projectId TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, categories TEXT NOT NULL, tags TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), optional INTEGER NOT NULL DEFAULT 0, estimatedUnitCostCents INTEGER NOT NULL DEFAULT 0 CHECK(estimatedUnitCostCents>=0));
CREATE INDEX requirements_project ON project_requirements(projectId);
CREATE TABLE project_assignments (id TEXT PRIMARY KEY, userId TEXT NOT NULL, projectId TEXT NOT NULL, itemId TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), UNIQUE(projectId,itemId), FOREIGN KEY(userId,projectId) REFERENCES projects(userId,id) ON DELETE CASCADE, FOREIGN KEY(userId,itemId) REFERENCES inventory_items(userId,id) ON DELETE RESTRICT);
CREATE INDEX assignments_item ON project_assignments(userId,itemId);
CREATE TABLE project_templates (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL, difficulty TEXT NOT NULL, duration TEXT NOT NULL, icon TEXT NOT NULL, accent TEXT NOT NULL, caveat TEXT NOT NULL);
CREATE TABLE template_requirements (id TEXT PRIMARY KEY, templateId TEXT NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE, name TEXT NOT NULL, categories TEXT NOT NULL, tags TEXT NOT NULL, quantity INTEGER NOT NULL CHECK(quantity>0), optional INTEGER NOT NULL DEFAULT 0, estimatedUnitCostCents INTEGER NOT NULL DEFAULT 0);
CREATE INDEX template_requirements_template ON template_requirements(templateId);
