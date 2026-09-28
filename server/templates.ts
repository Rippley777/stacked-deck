import type { DB } from './db.js';
import type { ProjectTemplate, Requirement } from '../shared/types.js';
const req = (
  name: string,
  categories: string[],
  cost: number,
  quantity = 1,
  optional = false,
  tags: string[] = [],
): Requirement => ({
  id: '',
  name,
  categories,
  tags,
  quantity,
  optional,
  estimatedUnitCostCents: cost * 100,
});
const host = () => req('Compatible host', ['Raspberry Pi', 'Development Board', 'Computer'], 80);
const power = () => req('Compatible power supply', ['Power Supply'], 15);
const network = () => req('Ethernet cable', ['Cable'], 8, 1, false, ['ethernet']);
const boot = () => req('Boot storage', ['SSD', 'MicroSD'], 25);
const caveat =
  'Category and tag matches are a starting point. Verify interfaces, capacity, software support, and power ratings before building. Each result is an independent build option.';
export const templates: ProjectTemplate[] = [
  {
    id: 'nas',
    name: 'Home NAS',
    description: 'Your files. Your hardware. Your own little cloud.',
    difficulty: 'Intermediate',
    duration: 'An afternoon',
    icon: 'server',
    accent: 'green',
    caveat: `${caveat} Confirm drive connectivity and use a separate backup.`,
    requirements: [
      host(),
      req('Storage drives', ['HDD', 'SSD'], 90, 2),
      req('USB to SATA adapter', ['Adapter'], 20, 1, false, ['sata']),
      network(),
      power(),
      req('Drive enclosure', [], 35, 1, true, ['enclosure']),
    ],
  },
  {
    id: 'pihole',
    name: 'Pi-hole',
    description: 'A quieter internet, for every device on your network.',
    difficulty: 'Beginner',
    duration: 'About an hour',
    icon: 'shield',
    accent: 'purple',
    caveat,
    requirements: [host(), boot(), network(), power()],
  },
  {
    id: 'retro',
    name: 'Retro gaming console',
    description: 'Give the classics a new home on your big screen.',
    difficulty: 'Beginner',
    duration: 'A few hours',
    icon: 'gamepad',
    accent: 'orange',
    caveat: `${caveat} Use games you have the right to run.`,
    requirements: [
      req('Raspberry Pi', ['Raspberry Pi'], 65),
      boot(),
      power(),
      req('Game controller', [], 25, 1, false, ['controller']),
      req('HDMI cable', ['Cable'], 10, 1, false, ['hdmi']),
      req('Display', ['Monitor'], 100, 1, true),
    ],
  },
  {
    id: 'home-server',
    name: 'Home server',
    description: 'A home for your services, experiments, and side projects.',
    difficulty: 'Intermediate',
    duration: 'An afternoon',
    icon: 'server',
    accent: 'blue',
    caveat,
    requirements: [host(), boot(), power(), network()],
  },
  {
    id: 'assistant',
    name: 'Home Assistant',
    description: 'Bring your smart home together under one roof.',
    difficulty: 'Beginner',
    duration: 'A few hours',
    icon: 'home',
    accent: 'blue',
    caveat,
    requirements: [
      host(),
      boot(),
      power(),
      network(),
      req('Zigbee coordinator', [], 30, 1, true, ['zigbee']),
    ],
  },
  {
    id: 'media',
    name: 'Media server',
    description: 'Your movie nights, served from your own collection.',
    difficulty: 'Intermediate',
    duration: 'An afternoon',
    icon: 'play',
    accent: 'orange',
    caveat: `${caveat} Transcoding capability depends on the host.`,
    requirements: [
      host(),
      req('Media storage', ['HDD', 'SSD'], 90),
      power(),
      network(),
      req('USB to SATA adapter', ['Adapter'], 20, 1, true, ['sata']),
    ],
  },
  {
    id: 'minecraft',
    name: 'Minecraft server',
    description: 'Build a world with friends on hardware you already own.',
    difficulty: 'Intermediate',
    duration: 'A few hours',
    icon: 'box',
    accent: 'green',
    caveat: `${caveat} Check RAM and CPU requirements for your edition, mods, and player count.`,
    requirements: [host(), boot(), network(), power()],
  },
  {
    id: 'cluster',
    name: 'Raspberry Pi cluster',
    description: 'A small fleet. A big playground for Kubernetes.',
    difficulty: 'Advanced',
    duration: 'A weekend',
    icon: 'network',
    accent: 'purple',
    caveat,
    requirements: [
      req('Raspberry Pi nodes', ['Raspberry Pi'], 65, 3),
      req('Network switch', ['Switch'], 30),
      req('Node power supplies', ['Power Supply'], 15, 3),
      req('Ethernet cables', ['Cable'], 8, 3, false, ['ethernet']),
      req('Boot drives', ['SSD', 'MicroSD'], 25, 3),
    ],
  },
  {
    id: 'monitoring',
    name: 'Network monitoring',
    description: 'Get a better picture of what is happening on your network.',
    difficulty: 'Intermediate',
    duration: 'A few hours',
    icon: 'activity',
    accent: 'green',
    caveat,
    requirements: [host(), boot(), network(), power()],
  },
  {
    id: 'dev',
    name: 'Local development server',
    description: 'An always-on workspace for the next thing you make.',
    difficulty: 'Intermediate',
    duration: 'An afternoon',
    icon: 'code',
    accent: 'blue',
    caveat,
    requirements: [host(), req('Development storage', ['SSD'], 50), power(), network()],
  },
  {
    id: 'ai',
    name: 'Local AI workstation',
    description: 'Run models locally. Keep your experiments close.',
    difficulty: 'Advanced',
    duration: 'A weekend',
    icon: 'sparkles',
    accent: 'purple',
    caveat: `${caveat} A laptop GPU cannot be installed in a desktop. Check GPU VRAM, motherboard, case clearance, and PSU wattage.`,
    requirements: [
      req('Desktop GPU', ['GPU'], 400, 1, false, ['desktop']),
      req('Processor', ['CPU'], 180),
      req('Motherboard', ['Motherboard'], 130),
      req('System memory', ['RAM'], 70),
      req('SSD', ['SSD'], 50),
      power(),
      req('Computer case', [], 70, 1, false, ['pc-case']),
    ],
  },
];
export function seedTemplates(db: DB) {
  db.transaction(() => {
    const insert = db.prepare(
      'INSERT INTO project_templates(id,name,description,difficulty,duration,icon,accent,caveat) VALUES (@id,@name,@description,@difficulty,@duration,@icon,@accent,@caveat) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,difficulty=excluded.difficulty,duration=excluded.duration,icon=excluded.icon,accent=excluded.accent,caveat=excluded.caveat',
    );
    const requirement = db.prepare(
      'INSERT INTO template_requirements(id,templateId,name,categories,tags,quantity,optional,estimatedUnitCostCents) VALUES (?,?,?,?,?,?,?,?)',
    );
    for (const template of templates) {
      insert.run({
        id: template.id,
        name: template.name,
        description: template.description,
        difficulty: template.difficulty,
        duration: template.duration,
        icon: template.icon,
        accent: template.accent,
        caveat: template.caveat,
      });
      db.prepare('DELETE FROM template_requirements WHERE templateId=?').run(template.id);
      template.requirements.forEach((r, i) =>
        requirement.run(
          `${template.id}-${i}`,
          template.id,
          r.name,
          JSON.stringify(r.categories),
          JSON.stringify(r.tags),
          r.quantity,
          Number(r.optional),
          r.estimatedUnitCostCents,
        ),
      );
    }
  })();
}
