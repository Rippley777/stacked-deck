ALTER TABLE inventory_items ADD connectivity nvarchar(max) NULL CONSTRAINT inventory_connectivity_json CHECK(connectivity IS NULL OR ISJSON(connectivity)=1);
