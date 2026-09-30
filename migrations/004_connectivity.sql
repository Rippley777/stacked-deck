ALTER TABLE inventory_items ADD COLUMN connectivity TEXT CHECK(connectivity IS NULL OR json_valid(connectivity));
