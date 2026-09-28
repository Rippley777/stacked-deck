import 'dotenv/config';
import { openDatabase } from './db.js';
import { createUser } from './auth.js';
import { SqliteStore } from './sqlite-store.js';
import { seedTemplates } from './templates.js';
import { Repository } from './repository.js';
import { itemSchema, projectSchema } from '../shared/validation.js';
if (process.env.DATABASE_PROVIDER === 'sqlserver')
  throw new Error('The demo seed is for local SQLite development only.');
const db = openDatabase(process.env.DATABASE_PATH || './data/stacked-deck.db');
seedTemplates(db);
const email = (process.env.SEED_EMAIL || 'demo@stackeddeck.local').toLowerCase();
const password = process.env.SEED_PASSWORD;
if (!password || password.length < 12) {
  console.error(
    'Set SEED_PASSWORD to at least 12 characters to create demo inventory. Templates are already installed.',
  );
  db.close();
  process.exit(1);
}
if (db.prepare('SELECT id FROM users WHERE email=?').get(email)) {
  console.log('Demo account already exists; its data was left unchanged.');
  db.close();
  process.exit(0);
}
const user = await createUser(new SqliteStore(db), 'Alex Morgan', email, password);
const r = new Repository(db, user.id);
db.transaction(() => {
  const office = r.saveLocation('Office → Workbench', 'The good stuff, within arm’s reach.');
  const shelf = r.saveLocation('Office → Shelf → Bin 3', 'Boards, adapters, and spare parts.');
  const rack = r.saveLocation('Server rack', 'Always-on hardware and networking.');
  const drawer = r.saveLocation(
    'Closet → Cable drawer',
    'Power, cables, and a little organized chaos.',
  );
  const add = (
    name: string,
    category: string,
    quantity: number,
    value: number,
    locationId: string,
    tags: string[] = [],
    manufacturer = '',
    model = '',
  ) =>
    r.saveItem(
      itemSchema.parse({
        name,
        category,
        quantity,
        estimatedValueCents: value * 100,
        purchasePriceCents: Math.round(value * 1.3) * 100,
        purchaseDate: '2024-06-12',
        locationId,
        tags,
        manufacturer,
        model,
        status: 'Available',
        condition: 'Good',
      }),
    );
  add(
    'Raspberry Pi 4 · 8GB',
    'Raspberry Pi',
    3,
    65,
    shelf.id,
    ['8gb', 'arm64'],
    'Raspberry Pi',
    '4 Model B',
  );
  add(
    'Raspberry Pi 3 Model B+',
    'Raspberry Pi',
    2,
    30,
    shelf.id,
    ['arm64'],
    'Raspberry Pi',
    '3 Model B+',
  );
  add(
    'GeForce RTX 3070 Ti',
    'GPU',
    1,
    320,
    office.id,
    ['desktop', '8gb', 'cuda'],
    'NVIDIA',
    'RTX 3070 Ti',
  );
  add(
    'GeForce GTX 1080 Ti',
    'GPU',
    1,
    170,
    shelf.id,
    ['desktop', '11gb', 'cuda'],
    'NVIDIA',
    'GTX 1080 Ti',
  );
  const laptop = add(
    'RTX 4070 Laptop GPU',
    'GPU',
    1,
    450,
    office.id,
    ['laptop', 'integrated'],
    'NVIDIA',
    'RTX 4070 Laptop',
  );
  r.saveItem(
    itemSchema.parse({
      ...laptop,
      status: 'In Use',
      notes: 'Inside my laptop; not a removable desktop GPU.',
    }),
    laptop.id,
    true,
  );
  add('WD Red Plus · 8TB', 'HDD', 2, 125, shelf.id, ['sata', 'nas'], 'Western Digital', 'WD80EFPX');
  add('Samsung 970 EVO · 512GB', 'SSD', 1, 35, office.id, ['nvme'], 'Samsung', '970 EVO');
  const sw = add(
    '8-port Gigabit switch',
    'Switch',
    1,
    25,
    rack.id,
    ['ethernet', 'gigabit'],
    'TP-Link',
    'TL-SG108',
  );
  add('USB 3.0 to SATA adapter', 'Adapter', 2, 15, shelf.id, ['sata', 'usb'], 'UGREEN');
  add(
    'ESP32 development board',
    'Microcontroller',
    4,
    8,
    shelf.id,
    ['wifi', 'bluetooth'],
    'Espressif',
    'ESP32',
  );
  add('Arduino Uno R3', 'Microcontroller', 2, 18, shelf.id, ['arduino'], 'Arduino', 'Uno R3');
  add(
    'Official Pi USB-C power supply',
    'Power Supply',
    3,
    12,
    drawer.id,
    ['usb-c', '5v'],
    'Raspberry Pi',
  );
  add('Cat 6 Ethernet cable', 'Cable', 6, 5, drawer.id, ['ethernet', 'cat6']);
  add('SanDisk Ultra microSD · 64GB', 'MicroSD', 4, 9, shelf.id, ['microsd'], 'SanDisk');
  add('HDMI cable · 2m', 'Cable', 2, 8, drawer.id, ['hdmi']);
  add('Dell UltraSharp · 27 inch', 'Monitor', 1, 200, office.id, ['display'], 'Dell', 'U2720Q');
  const project = r.saveProject(
    projectSchema.parse({
      name: 'Home network refresh',
      description: 'A faster, tidier network for the whole house.',
      status: 'In Progress',
      notes: 'Label the cables before moving the switch.',
      requirements: [
        {
          name: 'Gigabit switch',
          categories: ['Switch'],
          quantity: 1,
          optional: false,
          tags: [],
          estimatedUnitCostCents: 2500,
        },
      ],
    }),
  );
  r.assign(project.id, sw.id, 1);
  r.saveProject(
    projectSchema.parse({
      name: 'Desk companion',
      description: 'A tiny ESP32 display for weather and focus time.',
      status: 'Idea',
      requirements: [],
    }),
  );
})();
console.log(`Demo deck created for ${email}. Sign in using your SEED_PASSWORD.`);
db.close();
