import { describe, expect, it } from 'vitest';
import { checkPower, checkCable, check, findMatches } from '../shared/compatibility-engine.js';
import {
  connectivitySchema,
  type PowerRequirement,
  type PowerAdapter,
  type CableDetails,
  type Connection,
  type Connectivity,
} from '../shared/connectivity.js';
import {
  matchesConnectivity,
  parseCableQuery,
  possibleDuplicates,
} from '../shared/connectivity-search.js';
import type { InventoryItem } from '../shared/types.js';

const barrel = { connector: 'DC barrel', outerMm: 5.5, innerMm: 2.1 };
const device: PowerRequirement = {
  connector: barrel,
  voltage: 12,
  current: 1.5,
  wattage: 18,
  acDc: 'DC',
  polarity: 'center_positive',
  proprietaryProtocol: 'none',
};
const adapter: PowerAdapter = {
  connector: barrel,
  voltage: 12,
  current: 3,
  wattage: 36,
  acDc: 'DC',
  polarity: 'center_positive',
  proprietaryProtocol: 'none',
  outputMode: 'fixed',
};
const pdDevice: PowerRequirement = {
  connector: { connector: 'USB-C', gender: 'female' },
  acDc: 'DC',
  pd: true,
  pdProfiles: [{ voltage: 20, current: 3.25 }],
  recommendedW: 65,
  proprietaryProtocol: 'none',
};
const pdAdapter: PowerAdapter = {
  ...pdDevice,
  pdProfiles: [
    { voltage: 5, current: 3 },
    { voltage: 20, current: 5 },
  ],
  wattage: 100,
  ports: 1,
};
const usb: CableDetails = {
  family: 'usb',
  a: { connector: 'USB-C', gender: 'male' },
  b: { connector: 'USB-C', gender: 'male' },
  directional: false,
  supportsCharging: true,
  supportsData: true,
  supportsVideo: true,
  supportsAltMode: true,
  supportsPd: true,
  maxDataGbps: 10,
  maxPowerW: 100,
};
const video: Connection = {
  purpose: 'video',
  port: { connector: 'USB-C', gender: 'female' },
  role: 'input',
  supportsAltMode: true,
};
const item = (id: string, connectivity: Connectivity, rest: Partial<InventoryItem> = {}) =>
  ({
    id,
    name: id,
    connectivity,
    status: 'Available',
    condition: 'Good',
    quantity: 2,
    availableQuantity: 2,
    locationName: 'Office → Drawer 2',
    manufacturer: '',
    model: '',
    ...rest,
  }) as InventoryItem;

describe('conservative DC and AC compatibility', () => {
  it('accepts exact voltage and higher current and explains the numbers', () => {
    const result = checkPower(device, adapter);
    expect(result.status).toBe('compatible');
    expect(result.reasons.join(' ')).toContain('3A capacity meets 1.5A');
  });
  it.each([19, 9])('rejects incorrect %sV as unsafe', (voltage) =>
    expect(checkPower(device, { ...adapter, voltage }).status).toBe('unsafe'),
  );
  it('rejects too little current even if stated watts are high', () =>
    expect(checkPower(device, { ...adapter, current: 1 }).status).toBe('incompatible'));
  it('accepts correct polarity and rejects reversed polarity', () => {
    expect(checkPower(device, adapter).status).toBe('compatible');
    expect(checkPower(device, { ...adapter, polarity: 'center_negative' }).status).toBe('unsafe');
  });
  it.each(['polarity', 'voltage', 'current', 'acDc', 'outputMode', 'proprietaryProtocol'] as const)(
    'never confirms missing critical adapter %s',
    (key) => {
      const incomplete = {
        ...adapter,
        [key]: undefined,
        ...(key === 'current' ? { wattage: undefined } : {}),
      };
      expect(checkPower(device, incomplete).status).toBe('uncertain');
    },
  );
  it('rejects AC versus DC as unsafe', () =>
    expect(checkPower(device, { ...adapter, acDc: 'AC' }).status).toBe('unsafe'));
  it('compares AC output frequency', () => {
    const ac = { ...device, acDc: 'AC' as const, frequencyHz: 60 };
    expect(checkPower(ac, { ...adapter, acDc: 'AC', frequencyHz: 50 }).status).toBe('incompatible');
    expect(checkPower(ac, { ...adapter, acDc: 'AC' }).status).toBe('uncertain');
  });
  it('rejects barrel inner diameter mismatch and unknown dimensions', () => {
    expect(checkPower(device, { ...adapter, connector: { ...barrel, innerMm: 2.5 } }).status).toBe(
      'incompatible',
    );
    expect(checkPower(device, { ...adapter, connector: { connector: 'DC barrel' } }).status).toBe(
      'uncertain',
    );
  });
  it('calculates watts and never lets inconsistent current/watts hide an undersized adapter', () => {
    expect(
      checkPower({ ...device, current: undefined, wattage: 24 }, { ...adapter, wattage: undefined })
        .status,
    ).toBe('compatible');
    expect(checkPower({ ...device, wattage: 48 }, adapter).status).toBe('incompatible');
    expect(checkPower({ ...device, current: 4, wattage: 12 }, adapter).status).toBe('incompatible');
  });
  it('does not certify variable outputs or unknown/proprietary pinouts', () => {
    expect(checkPower(device, { ...adapter, outputMode: 'variable' }).status).toBe('uncertain');
    expect(checkPower({ ...device, proprietaryProtocol: 'Dell ID' }, adapter).status).toBe(
      'incompatible',
    );
    expect(
      checkPower(
        { ...device, connector: { connector: 'Special plug' } },
        { ...adapter, connector: { connector: 'Special plug' } },
      ).status,
    ).toBe('uncertain');
  });
  it('unreviewed AI data cannot confirm safety, but unsafe mismatches remain unsafe', () => {
    expect(check({ version: 1, power: device }, { version: 1, adapter }).status).toBe('uncertain');
    expect(
      check({ version: 1, power: device }, { version: 1, adapter: { ...adapter, voltage: 19 } })
        .status,
    ).toBe('unsafe');
    expect(
      check({ version: 1, verified: true, power: device }, { version: 1, verified: true, adapter })
        .status,
    ).toBe('compatible');
  });
  it('old records without specifications remain uncertain', () =>
    expect(check(null, null).status).toBe('uncertain'));
});
describe('USB Power Delivery', () => {
  it('finds a shared profile and accepts a higher wattage charger with female USB-C ports', () =>
    expect(checkPower(pdDevice, pdAdapter).status).toBe('compatible'));
  it('accepts an exact 65W profile', () =>
    expect(
      checkPower(pdDevice, { ...pdAdapter, pdProfiles: [{ voltage: 20, current: 3.25 }] }).status,
    ).toBe('compatible'));
  it('reports limited 45W or 20W power only on a documented shared voltage', () => {
    for (const current of [2.25, 1])
      expect(
        checkPower(pdDevice, { ...pdAdapter, pdProfiles: [{ voltage: 20, current }] }).status,
      ).toBe('limited');
  });
  it('does not assume a 20W phone charger offers the laptop voltage', () =>
    expect(
      checkPower(pdDevice, {
        ...pdAdapter,
        pdProfiles: [
          { voltage: 5, current: 3 },
          { voltage: 9, current: 2.22 },
        ],
      }).status,
    ).toBe('incompatible'));
  it('requires explicit PD support and profiles', () => {
    expect(checkPower(pdDevice, { ...pdAdapter, pdProfiles: undefined }).status).toBe('uncertain');
    expect(checkPower(pdDevice, { ...pdAdapter, pd: false }).status).toBe('incompatible');
    expect(checkPower(pdDevice, { ...pdAdapter, pd: undefined }).status).toBe('uncertain');
  });
  it('requires a per-port budget on multiport chargers and caps negotiation by it', () => {
    expect(checkPower(pdDevice, { ...pdAdapter, ports: 3 }).status).toBe('uncertain');
    expect(checkPower(pdDevice, { ...pdAdapter, ports: 3, perPortW: 45 }).status).toBe('limited');
  });
});
describe('cable capabilities and direction', () => {
  it('matches a video and Alt Mode capable cable', () =>
    expect(checkCable(video, usb).status).toBe('compatible'));
  it('rejects a charging-only cable for video and data', () => {
    const cable = { ...usb, supportsData: false, supportsVideo: false };
    expect(checkCable(video, cable).status).toBe('incompatible');
    expect(checkCable({ ...video, purpose: 'data' }, cable).status).toBe('incompatible');
  });
  it('rejects USB2 bandwidth for a high-speed connection', () =>
    expect(
      checkCable(
        { ...video, purpose: 'data', maxDataGbps: 10 },
        { ...usb, usbVersion: 'USB 2.0', maxDataGbps: 0.48 },
      ).status,
    ).toBe('incompatible'));
  it('reports a lower-rated charging cable with limitations', () =>
    expect(
      checkCable(
        { ...video, purpose: 'charging', maxPowerW: 100, supportsPd: true },
        { ...usb, maxPowerW: 60 },
      ).status,
    ).toBe('limited'));
  it.each(['HDMI', 'DisplayPort'])(
    'compares %s bandwidth, resolution and refresh as paired modes',
    (connector) => {
      const port: Connection = {
        purpose: 'video',
        port: { connector, gender: 'female' },
        maxDataGbps: 32,
        videoModes: [{ width: 3840, height: 2160, hz: 120 }],
      };
      const cable: CableDetails = {
        a: { connector, gender: 'male' },
        b: { connector, gender: 'male' },
        directional: false,
        supportsVideo: true,
        maxDataGbps: 48,
        videoModes: [{ width: 3840, height: 2160, hz: 120 }],
      };
      expect(checkCable(port, cable).status).toBe('compatible');
      expect(checkCable(port, { ...cable, maxDataGbps: 10.2 }).status).toBe('incompatible');
      expect(
        checkCable(port, {
          ...cable,
          videoModes: [
            { width: 7680, height: 4320, hz: 30 },
            { width: 1920, height: 1080, hz: 120 },
          ],
        }).status,
      ).toBe('incompatible');
      expect(checkCable(port, { ...cable, videoModes: undefined }).status).toBe('uncertain');
    },
  );
  it('reports unknown capability rather than inferring from USB-C shape', () =>
    expect(checkCable(video, { ...usb, supportsVideo: undefined }).status).toBe('uncertain'));
  it('checks both endpoints and genders', () => {
    expect(
      checkCable({ ...video, sourcePort: { connector: 'HDMI', gender: 'female' } }, usb).status,
    ).toBe('incompatible');
    expect(
      checkCable(video, { ...usb, a: { connector: 'HDMI' }, b: { connector: 'HDMI' } }).status,
    ).toBe('incompatible');
    expect(checkCable({ ...video, port: { connector: 'USB-C', gender: 'male' } }, usb).status).toBe(
      'incompatible',
    );
    expect(
      checkCable(video, { ...usb, a: { connector: 'USB-C' }, b: { connector: 'USB-C' } }).status,
    ).toBe('uncertain');
  });
  it('handles directional USB-C to HDMI conversion in the correct direction', () => {
    const cable = { ...usb, b: { connector: 'HDMI', gender: 'male' as const }, directional: true };
    expect(checkCable(video, cable).status).toBe('incompatible');
    expect(checkCable({ ...video, role: 'output' }, cable).status).toBe('compatible');
    expect(checkCable({ ...video, role: undefined }, cable).status).toBe('uncertain');
  });
  it('recognizes IEC mating pairs without certifying mains safety', () =>
    expect(
      checkCable(
        { purpose: 'power', port: { connector: 'IEC C14', gender: 'male' } },
        {
          a: { connector: 'IEC C13', gender: 'female' },
          b: { connector: 'AC plug' },
          directional: false,
        },
      ).status,
    ).toBe('uncertain'));
});
describe('inventory matching and queries', () => {
  const router = item('router', { version: 1, verified: true, power: device });
  const charger = item('charger', { version: 1, verified: true, adapter });
  it('matches forward and in reverse and includes location/quantity', () => {
    expect(findMatches(router, [charger])[0]).toMatchObject({
      itemId: 'charger',
      location: 'Office → Drawer 2',
      quantity: 2,
      result: { status: 'compatible' },
    });
    expect(findMatches(charger, [router])[0].itemId).toBe('router');
  });
  it('excludes discarded/broken stock and distinguishes owned from available', () => {
    const matches = findMatches(router, [
      charger,
      { ...charger, id: 'sold', status: 'Sold' },
      { ...charger, id: 'broken', status: 'Broken' },
      { ...charger, id: 'used', availableQuantity: 0 },
    ]);
    expect(matches.map((m) => m.itemId)).toEqual(['charger', 'used']);
    expect(findMatches({ ...router, status: 'Broken' }, [charger])[0].result.status).toBe('unsafe');
  });
  it.each([
    [
      'Show me USB-C cables that support 100W charging',
      { accessory: 'cable', connector: 'USB-C', minWatts: 100, charging: 'true' },
    ],
    [
      'Show me cables that can run 4K 120Hz',
      { accessory: 'cable', width: 3840, height: 2160, hz: 120 },
    ],
    ['Show me HDMI 2.1 cables', { accessory: 'cable', connector: 'HDMI', standard: 'HDMI 2.1' }],
    ['Show me 12V power adapters', { accessory: 'adapter', voltage: 12 }],
    [
      'Show me adapters with 5.5 x 2.1mm connectors',
      { accessory: 'adapter', outerMm: 5.5, innerMm: 2.1 },
    ],
    [
      'Show me Ethernet cables capable of 10Gbps',
      { accessory: 'cable', connector: 'RJ45', minGbps: 10 },
    ],
  ])('parses %s without AI', (query, filters) =>
    expect(parseCableQuery(query)).toEqual({ text: '', filters }),
  );
  it('requires dimensions on the same end and paired video modes for search', () => {
    const cable = item('cable', {
      version: 1,
      cable: {
        ...usb,
        videoModes: [
          { width: 7680, height: 4320, hz: 30 },
          { width: 1920, height: 1080, hz: 120 },
        ],
      },
    });
    expect(matchesConnectivity(cable, { width: 3840, height: 2160, hz: 120 })).toBe(false);
    expect(matchesConnectivity(cable, { minWatts: 100 })).toBe(true);
    expect(matchesConnectivity(charger, { voltage: 12, outerMm: 5.5, innerMm: 2.1 })).toBe(true);
  });
  it('suggests possible duplicates without merging or treating empty specs as identical', () => {
    expect(possibleDuplicates(charger, [charger])).toHaveLength(1);
    expect(
      possibleDuplicates({ connectivity: { version: 1, cable: {} } }, [
        item('empty', { version: 1, cable: {} }),
      ]),
    ).toHaveLength(0);
  });
  it('validates numeric limits and preserves explicit false versus unknown', () => {
    expect(connectivitySchema.safeParse({ version: 1, adapter: { voltage: -12 } }).success).toBe(
      false,
    );
    expect(
      connectivitySchema.parse({ version: 1, cable: { supportsVideo: false } }).cable
        ?.supportsVideo,
    ).toBe(false);
    expect(
      connectivitySchema.parse({ version: 1, cable: {} }).cable?.supportsVideo,
    ).toBeUndefined();
  });
});

it('keeps ordinary cable names as text searches for legacy records', () => {
  for (const query of ['Cable Matters', 'HDMI cable', 'Anker adapter', 'USB-C'])
    expect(parseCableQuery(query)).toEqual({ filters: {}, text: query.toLowerCase() });
});
it('does not let a low recommended wattage override a higher required PD wattage', () => {
  expect(checkPower({ ...pdDevice, wattage: 140, recommendedW: 65 }, pdAdapter).status).toBe(
    'limited',
  );
});
it('rejects AC output claimed as USB-PD', () => {
  expect(checkPower({ ...pdDevice, acDc: 'AC' }, { ...pdAdapter, acDc: 'AC' }).status).toBe(
    'unsafe',
  );
});
it('finds similar adapters despite missing nonessential input-label metadata', () => {
  const saved = item('saved', {
    version: 1,
    adapter: { ...adapter, inputVoltage: '100–240V', inputFrequency: '50/60Hz' },
  });
  expect(possibleDuplicates({ connectivity: { version: 1, adapter } }, [saved])).toHaveLength(1);
  expect(
    possibleDuplicates(
      { connectivity: { version: 1, adapter: { ...adapter, polarity: 'center_negative' } } },
      [saved],
    ),
  ).toHaveLength(0);
});

it('matches shared PD profiles for duplicates regardless of label order', () => {
  expect(
    possibleDuplicates({ connectivity: { version: 1, adapter: pdAdapter } }, [
      item('PD charger', {
        version: 1,
        adapter: { ...pdAdapter, pdProfiles: [...pdAdapter.pdProfiles!].reverse() },
      }),
    ]),
  ).toHaveLength(1);
});
it('rejects out-of-range fixed USB-PD profiles', () => {
  for (const profile of [
    { voltage: 100, current: 3 },
    { voltage: 20, current: 10 },
  ])
    expect(
      connectivitySchema.safeParse({ version: 1, adapter: { pdProfiles: [profile] } }).success,
    ).toBe(false);
});

it('does not confirm a video mode with different or unknown compression conditions', () => {
  const mode = { width: 3840, height: 2160, hz: 120 };
  expect(
    checkCable(
      { ...video, videoModes: [mode] },
      { ...usb, videoModes: [{ ...mode, note: 'DSC required' }] },
    ).status,
  ).toBe('uncertain');
  expect(
    checkCable(
      { ...video, videoModes: [{ ...mode, note: '10-bit HDR' }] },
      { ...usb, videoModes: [mode] },
    ).status,
  ).toBe('uncertain');
});
