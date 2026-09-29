import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';
import { expect, it } from 'vitest';
import { Repository } from '../server/repository.js';
import { summarizePortfolio } from '../server/portfolio.js';
it('migrates existing manual values and holdings at migration time without inventing older history', () => {
  const db = new Database(':memory:');
  try {
    db.pragma('foreign_keys = ON');
    for (const name of ['001_initial.sql', '002_systems.sql'])
      db.exec(readFileSync(`migrations/${name}`, 'utf8'));
    db.exec(`INSERT INTO users(id,name,email) VALUES ('owner','Owner','migration@example.com');
      INSERT INTO categories(userId,name) VALUES ('owner','GPU'),('owner','Desktop Computer');
      INSERT INTO inventory_items(id,userId,name,category,quantity,condition,status,estimatedValueCents,createdAt,kind,systemSpecs)
      VALUES ('gpu','owner','GPU','GPU',3,'Good','Available',5000,'2020-01-01T00:00:00Z','Component',NULL),
      ('pc','owner','PC','Desktop Computer',1,'Good','Available',20000,'2020-01-01T00:00:00Z','System','{}'),
      ('unknown','owner','Unpriced','GPU',1,'Good','Available',NULL,'2020-01-01T00:00:00Z','Component',NULL);
      INSERT INTO system_components(id,userId,systemId,itemId,quantity) VALUES ('link','owner','pc','gpu',2);`);
    db.exec(readFileSync('migrations/003_valuations.sql', 'utf8'));
    const repo = new Repository(db, 'owner');
    expect(repo.item('gpu')).toMatchObject({
      estimatedValueCents: 5000,
      manualValueOverrideCents: 5000,
      aiValuation: null,
    });
    expect(repo.valuations('gpu')[0]).toMatchObject({
      source: 'manual',
      provider: 'legacy',
      effectiveValueCents: 5000,
    });
    expect(repo.valuations('unknown')).toEqual([]);
    const portfolio = summarizePortfolio(repo.inventory(), repo.portfolioEvents());
    expect(portfolio.totalValueCents).toBe(25000);
    expect(portfolio.history).toEqual([
      { date: new Date().toISOString().slice(0, 10), valueCents: 25000 },
    ]);
    expect(() =>
      db
        .prepare(
          'INSERT INTO equipment_valuations(id,userId,itemId,source,provider,createdAt) VALUES (?,?,?,?,?,?)',
        )
        .run('bad', 'other', 'gpu', 'manual', 'user', new Date().toISOString()),
    ).toThrow();
  } finally {
    db.close();
  }
});
