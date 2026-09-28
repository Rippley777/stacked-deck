CREATE TABLE users (id nvarchar(36) NOT NULL PRIMARY KEY, name nvarchar(160) NOT NULL, email nvarchar(254) COLLATE Latin1_General_100_CI_AS NOT NULL UNIQUE, createdAt nvarchar(24) NOT NULL DEFAULT (CONVERT(varchar(23),SYSUTCDATETIME(),126)+'Z'));
CREATE TABLE identities (id nvarchar(36) NOT NULL PRIMARY KEY, userId nvarchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE, provider nvarchar(40) NOT NULL, subject nvarchar(254) NOT NULL, passwordHash nvarchar(300), UNIQUE(provider,subject));
CREATE INDEX identities_user ON identities(userId);
CREATE TABLE sessions (tokenHash nvarchar(64) NOT NULL PRIMARY KEY, userId nvarchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE, expiresAt bigint NOT NULL);
CREATE INDEX sessions_expiry ON sessions(expiresAt);
CREATE INDEX sessions_user ON sessions(userId);
CREATE TABLE categories (userId nvarchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE, name nvarchar(160) NOT NULL, PRIMARY KEY(userId,name));
CREATE TABLE locations (id nvarchar(36) NOT NULL PRIMARY KEY, userId nvarchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE, name nvarchar(160) NOT NULL, description nvarchar(500) NOT NULL DEFAULT '', UNIQUE(userId,name), UNIQUE(userId,id));
CREATE TABLE inventory_items (
 id nvarchar(36) NOT NULL PRIMARY KEY, userId nvarchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE, name nvarchar(160) NOT NULL, manufacturer nvarchar(160) NOT NULL DEFAULT '', model nvarchar(160) NOT NULL DEFAULT '', category nvarchar(160) NOT NULL,
 quantity int NOT NULL CHECK(quantity > 0), condition nvarchar(30) NOT NULL CHECK(condition IN ('New','Like New','Good','Fair','For Parts')),
 status nvarchar(30) NOT NULL CHECK(status IN ('Available','In Use','Reserved','Broken','Loaned','Sold','Archived')), locationId nvarchar(36),
 notes nvarchar(max) NOT NULL DEFAULT '', purchasePriceCents int CHECK(purchasePriceCents >= 0), purchaseDate nvarchar(10), estimatedValueCents int CHECK(estimatedValueCents >= 0), serialNumber nvarchar(160) NOT NULL DEFAULT '', imageUrl nvarchar(2048) NOT NULL DEFAULT '',
 createdAt nvarchar(24) NOT NULL DEFAULT (CONVERT(varchar(23),SYSUTCDATETIME(),126)+'Z'), updatedAt nvarchar(24) NOT NULL DEFAULT (CONVERT(varchar(23),SYSUTCDATETIME(),126)+'Z'),
 UNIQUE(userId,id), FOREIGN KEY(userId,category) REFERENCES categories(userId,name), FOREIGN KEY(userId,locationId) REFERENCES locations(userId,id)
);
CREATE INDEX inventory_user_status ON inventory_items(userId,status);
CREATE INDEX inventory_user_category ON inventory_items(userId,category);
CREATE INDEX inventory_user_location ON inventory_items(userId,locationId);
CREATE INDEX inventory_user_created ON inventory_items(userId,createdAt DESC);
CREATE TABLE tags (userId nvarchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE, name nvarchar(60) NOT NULL, PRIMARY KEY(userId,name));
CREATE TABLE item_tags (userId nvarchar(36) NOT NULL, itemId nvarchar(36) NOT NULL, tag nvarchar(60) NOT NULL, PRIMARY KEY(itemId,tag), FOREIGN KEY(userId,itemId) REFERENCES inventory_items(userId,id) ON DELETE CASCADE, FOREIGN KEY(userId,tag) REFERENCES tags(userId,name));
CREATE INDEX tags_lookup ON item_tags(userId,tag,itemId);
CREATE TABLE projects (id nvarchar(36) NOT NULL PRIMARY KEY, userId nvarchar(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE, name nvarchar(160) NOT NULL, description nvarchar(3000) NOT NULL DEFAULT '', status nvarchar(30) NOT NULL CHECK(status IN ('Idea','Planning','Ready','In Progress','Complete','Abandoned')), notes nvarchar(max) NOT NULL DEFAULT '', estimatedCostCents int CHECK(estimatedCostCents >= 0), createdAt nvarchar(24) NOT NULL DEFAULT (CONVERT(varchar(23),SYSUTCDATETIME(),126)+'Z'), UNIQUE(userId,id));
CREATE INDEX projects_user_status ON projects(userId,status);
CREATE TABLE project_requirements (id nvarchar(36) NOT NULL PRIMARY KEY, projectId nvarchar(36) NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name nvarchar(160) NOT NULL, categories nvarchar(max) NOT NULL CHECK(ISJSON(categories)=1), tags nvarchar(max) NOT NULL CHECK(ISJSON(tags)=1), quantity int NOT NULL CHECK(quantity>0), optional bit NOT NULL DEFAULT 0, estimatedUnitCostCents int NOT NULL DEFAULT 0 CHECK(estimatedUnitCostCents>=0));
CREATE INDEX requirements_project ON project_requirements(projectId);
CREATE TABLE project_assignments (id nvarchar(36) NOT NULL PRIMARY KEY, userId nvarchar(36) NOT NULL, projectId nvarchar(36) NOT NULL, itemId nvarchar(36) NOT NULL, quantity int NOT NULL CHECK(quantity>0), UNIQUE(projectId,itemId), FOREIGN KEY(userId,projectId) REFERENCES projects(userId,id) ON DELETE CASCADE, FOREIGN KEY(userId,itemId) REFERENCES inventory_items(userId,id));
CREATE INDEX assignments_item ON project_assignments(userId,itemId);
CREATE TABLE project_templates (id nvarchar(80) NOT NULL PRIMARY KEY, name nvarchar(160) NOT NULL, description nvarchar(3000) NOT NULL, difficulty nvarchar(30) NOT NULL, duration nvarchar(80) NOT NULL, icon nvarchar(40) NOT NULL, accent nvarchar(30) NOT NULL, caveat nvarchar(3000) NOT NULL);
CREATE TABLE template_requirements (id nvarchar(100) NOT NULL PRIMARY KEY, templateId nvarchar(80) NOT NULL REFERENCES project_templates(id) ON DELETE CASCADE, name nvarchar(160) NOT NULL, categories nvarchar(max) NOT NULL CHECK(ISJSON(categories)=1), tags nvarchar(max) NOT NULL CHECK(ISJSON(tags)=1), quantity int NOT NULL CHECK(quantity>0), optional bit NOT NULL DEFAULT 0, estimatedUnitCostCents int NOT NULL DEFAULT 0);
CREATE INDEX template_requirements_template ON template_requirements(templateId);
