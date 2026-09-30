import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { Repository } from '../server/repository.js';
it('adds optional connectivity without changing pre-existing equipment, values, or quantities', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys=ON');
    for (const name of ['001_initial.sql', '002_systems.sql', '003_valuations.sql'])
      db.exec(readFileSync(`migrations/${name}`, 'utf8'));
    db.exec(
      "INSERT INTO users(id,name,email) VALUES ('owner','Owner','old@example.com'); INSERT INTO categories(userId,name) VALUES ('owner','Cable'); INSERT INTO inventory_items(id,userId,name,category,quantity,condition,status,estimatedValueCents) VALUES ('old','owner','Legacy cable','Cable',3,'Good','Available',1500);",
    );
    db.exec(readFileSync('migrations/004_connectivity.sql', 'utf8'));
    const item = new Repository(db, 'owner').item('old');
    expect(item).toMatchObject({
      name: 'Legacy cable',
      quantity: 3,
      estimatedValueCents: 1500,
      connectivity: null,
    });
    expect(() =>
      db.prepare('UPDATE inventory_items SET connectivity=?').run('{bad json'),
    ).toThrow();
  } finally {
    db.close();
  }
});
