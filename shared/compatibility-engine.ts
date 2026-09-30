import type { InventoryItem } from './types.js';
import type {
  CableDetails,
  CompatibilityMatch,
  CompatibilityResult,
  CompatibilityStatus,
  Connection,
  Connectivity,
  Endpoint,
  PowerAdapter,
  PowerRequirement,
} from './connectivity.js';

const severity: Record<CompatibilityStatus, number> = {
  compatible: 0,
  limited: 1,
  uncertain: 2,
  incompatible: 3,
  unsafe: 4,
};
function evaluation(scope: string) {
  const result: CompatibilityResult = { status: 'compatible', reasons: [], verify: [], scope };
  const add = (status: CompatibilityStatus, message: string) => {
    if (severity[status] > severity[result.status]) result.status = status;
    result.reasons.push(message);
  };
  const unknown = (field: string) => {
    result.verify.push(field);
    add('uncertain', `Verify ${field}; compatibility cannot be confirmed without it.`);
  };
  return { result, add, unknown };
}
const known = (s?: string) => Boolean(s && s !== 'Unknown');
const same = (a: number, b: number) => Math.abs(a - b) < 0.000001;
const mating: Record<string, string> = {
  'IEC C5': 'IEC C6',
  'IEC C6': 'IEC C5',
  'IEC C7': 'IEC C8',
  'IEC C8': 'IEC C7',
  'IEC C13': 'IEC C14',
  'IEC C14': 'IEC C13',
  'IEC C19': 'IEC C20',
  'IEC C20': 'IEC C19',
};
function fits(a?: Endpoint, b?: Endpoint): boolean | undefined {
  if (!known(a?.connector) || !known(b?.connector)) return undefined;
  return (mating[a!.connector!] || a!.connector) === b!.connector;
}
function checkConnector(
  device: Endpoint | undefined,
  supply: Endpoint | undefined,
  e: ReturnType<typeof evaluation>,
  genders = false,
) {
  const fit = fits(device, supply);
  if (fit === undefined) e.unknown('connector type');
  else if (!fit)
    e.add(
      'incompatible',
      `Connector mismatch: ${device?.connector} and ${supply?.connector}. An appropriate adapter would be needed; it is not evaluated here.`,
    );
  else e.add('compatible', `${device?.connector} connector matches.`);
  if (
    (genders || device?.connector === 'DC barrel') &&
    device?.gender &&
    supply?.gender &&
    device.gender === supply.gender
  )
    e.add('incompatible', 'Connector genders do not mate.');
  else if (genders && (!device?.gender || !supply?.gender)) e.unknown('connector genders');
  if (device?.connector === 'DC barrel' || supply?.connector === 'DC barrel') {
    for (const [key, label] of [
      ['outerMm', 'outer diameter'],
      ['innerMm', 'inner diameter'],
    ] as const) {
      if (!device?.[key] || !supply?.[key]) e.unknown(`barrel ${label}`);
      else if (!same(device[key]!, supply[key]!))
        e.add(
          'incompatible',
          `Barrel ${label} differs: ${device[key]} mm versus ${supply[key]} mm.`,
        );
      else e.add('compatible', `Barrel ${label}: ${device[key]} mm matches.`);
    }
  }
  if (
    [device?.connector, supply?.connector].some(
      (c) =>
        c &&
        ![
          'USB-A',
          'USB-B',
          'USB-C',
          'Mini USB',
          'Micro USB',
          'DC barrel',
          ...Object.keys(mating),
          'HDMI',
          'Mini HDMI',
          'Micro HDMI',
          'DisplayPort',
          'Mini DisplayPort',
          'RJ45',
          'TOSLINK',
        ].includes(c),
    )
  )
    e.unknown('exact connector variant and pinout');
}
function evidence(
  a: Connectivity | null | undefined,
  b: Connectivity | null | undefined,
  e: ReturnType<typeof evaluation>,
) {
  if (!a?.verified || !b?.verified)
    e.unknown('specifications against labels or manufacturer documentation for both items');
}
function capacity(p: { voltage?: number; current?: number; wattage?: number }) {
  const calculated = p.voltage && p.current ? p.voltage * p.current : undefined;
  return p.wattage && calculated ? Math.min(p.wattage, calculated) : (p.wattage ?? calculated);
}
export function checkPower(device?: PowerRequirement, adapter?: PowerAdapter): CompatibilityResult {
  const e = evaluation(
    'Adapter output to device input. Wall supply, physical condition, and a separate charging cable are not checked.',
  );
  if (!device || !adapter) {
    e.unknown('device power requirements and adapter output specifications');
    return e.result;
  }
  checkConnector(device.connector, adapter.connector, e);
  if (!device.acDc || !adapter.acDc) e.unknown('AC or DC output');
  else if (device.acDc !== adapter.acDc)
    e.add('unsafe', `The device requires ${device.acDc}; the adapter supplies ${adapter.acDc}.`);
  if (!device.proprietaryProtocol || !adapter.proprietaryProtocol)
    e.unknown('proprietary charging requirements (record “none” only when confirmed)');
  else if (device.proprietaryProtocol.toLowerCase() !== adapter.proprietaryProtocol.toLowerCase())
    e.add('incompatible', 'Proprietary charging protocols differ.');
  if (device.pd === true || adapter.pd === true) {
    if (device.acDc === 'AC' || adapter.acDc === 'AC')
      e.add(
        'unsafe',
        'USB Power Delivery must use DC; the recorded AC output is not safe for this connection.',
      );
    if (device.pd === undefined || adapter.pd === undefined)
      e.unknown('USB Power Delivery support');
    else if (!device.pd || !adapter.pd)
      e.add(
        'incompatible',
        'Both devices must explicitly support USB Power Delivery for this comparison.',
      );
    if (!device.pdProfiles?.length || !adapter.pdProfiles?.length)
      e.unknown('supported USB-PD voltage/current profiles');
    else {
      const common = device.pdProfiles.flatMap((d) =>
        adapter
          .pdProfiles!.filter((a) => same(a.voltage, d.voltage))
          .map((a) => ({ voltage: d.voltage, watts: d.voltage * Math.min(d.current, a.current) })),
      );
      if (!common.length)
        e.add('incompatible', 'There is no documented shared USB-PD voltage profile.');
      else {
        const best = common.reduce((a, b) => (a.watts >= b.watts ? a : b));
        const watts = Math.min(
          best.watts,
          adapter.wattage ?? Infinity,
          adapter.perPortW ?? Infinity,
        );
        const wanted = Math.max(
          device.recommendedW ?? 0,
          device.wattage ?? 0,
          (device.voltage ?? 0) * (device.current ?? 0),
        );
        e.add(
          'compatible',
          `Shared USB-PD profile at ${best.voltage}V can negotiate up to ${Number(watts.toFixed(2))}W.`,
        );
        if (!wanted) e.unknown('required or recommended charging wattage');
        else if (watts + 0.01 < wanted)
          e.add(
            'limited',
            `Below the device’s ${wanted}W target. Charging may be slower or insufficient under load; operation is not guaranteed.`,
          );
        else e.add('compatible', `Meets the device’s ${wanted}W charging target.`);
      }
    }
    if (adapter.ports === undefined) e.unknown('charger port count and any shared power budget');
    else if (adapter.ports > 1 && !adapter.perPortW)
      e.unknown('available wattage on this port with other ports in use');
  } else {
    if (device.connector?.connector === 'USB-C' || adapter.connector?.connector === 'USB-C') {
      if (device.pd === undefined || adapter.pd === undefined)
        e.unknown('whether USB-C requires Power Delivery');
    }
    if (!device.voltage || !adapter.voltage) e.unknown('output voltage');
    else if (!same(device.voltage, adapter.voltage))
      e.add(
        'unsafe',
        `Device: ${device.voltage}V. Adapter: ${adapter.voltage}V. Voltage mismatch could damage equipment; do not use.`,
      );
    else e.add('compatible', `Voltage matches at ${device.voltage}V.`);
    if (!adapter.outputMode) e.unknown('fixed or variable adapter output');
    else if (adapter.outputMode === 'variable')
      e.unknown('selected voltage and regulation of this variable adapter');
    if (device.acDc === 'AC') {
      if (!device.frequencyHz || !adapter.frequencyHz) e.unknown('AC output frequency');
      else if (!same(device.frequencyHz, adapter.frequencyHz))
        e.add('incompatible', 'AC output frequency does not match.');
    }
    if (
      device.acDc === 'DC' &&
      !['USB-A', 'USB-B', 'USB-C', 'Mini USB', 'Micro USB'].includes(
        device.connector?.connector || '',
      )
    ) {
      if (!device.polarity || !adapter.polarity) e.unknown('polarity');
      else if (device.polarity !== adapter.polarity)
        e.add('unsafe', 'Polarity is reversed. Do not use: this could damage the device.');
      else e.add('compatible', `Polarity matches: ${device.polarity.replace('_', ' ')}.`);
    }
    const required = capacity(device);
    const available = capacity(adapter);
    const amps =
      device.current ?? (required && device.voltage ? required / device.voltage : undefined);
    const availableAmps =
      adapter.current ?? (available && adapter.voltage ? available / adapter.voltage : undefined);
    if (!amps || !availableAmps) e.unknown('minimum device current and adapter current capacity');
    else if (availableAmps + 0.000001 < amps)
      e.add('incompatible', `Requires ${amps}A, but adapter provides only ${availableAmps}A.`);
    else
      e.add(
        'compatible',
        `${availableAmps}A capacity meets ${amps}A required; the device draws only what it needs.`,
      );
    // Explicit power and current requirements must BOTH be met, even if input data is inconsistent.
    const minimumW = Math.max(device.wattage ?? 0, (device.voltage ?? 0) * (device.current ?? 0));
    if (minimumW && available !== undefined && available + 0.01 < minimumW)
      e.add(
        'incompatible',
        `${Number(available.toFixed(2))}W available is below ${minimumW}W required.`,
      );
  }
  return e.result;
}

export function checkCable(connection: Connection, cable: CableDetails): CompatibilityResult {
  const e = evaluation(
    `Matches ${connection.label || connection.purpose} on this device${connection.sourcePort ? ' and the specified other endpoint' : '; check the other device’s port separately'}.`,
  );
  const possibilities = [
    { end: cable.a, other: cable.b, side: 'a' },
    { end: cable.b, other: cable.a, side: 'b' },
  ];
  const candidates = possibilities.filter(
    (p) =>
      fits(connection.port, p.end) !== false &&
      (!connection.sourcePort || fits(connection.sourcePort, p.other) !== false),
  );
  if (!candidates.length) {
    e.add(
      'incompatible',
      'Connector ends do not fit the requested connection. An adapter would be required and has not been checked.',
    );
    return e.result;
  }
  const genderFits = (port?: Endpoint, end?: Endpoint) =>
    !port?.gender || !end?.gender || port.gender !== end.gender;
  const matingCandidates = candidates.filter(
    (p) =>
      genderFits(connection.port, p.end) &&
      (!connection.sourcePort || genderFits(connection.sourcePort, p.other)),
  );
  const suitable = matingCandidates.length ? matingCandidates : candidates;
  const selected =
    suitable.find(
      (p) =>
        cable.directional !== true ||
        (connection.role === 'input'
          ? p.side === 'b'
          : connection.role === 'output'
            ? p.side === 'a'
            : false),
    ) || suitable[0];
  checkConnector(connection.port, selected.end, e, true);
  if (connection.sourcePort) checkConnector(connection.sourcePort, selected.other, e, true);
  else if (!known(selected.other?.connector)) e.unknown('connector at the other end of the cable');
  if (cable.directional === undefined) e.unknown('cable directionality');
  else if (cable.directional) {
    if (!connection.role || connection.role === 'bidirectional')
      e.unknown('signal direction for this device (cable runs A → B)');
    else if (
      (connection.role === 'input' && selected.side !== 'b') ||
      (connection.role === 'output' && selected.side !== 'a')
    )
      e.add(
        'incompatible',
        'This directional cable carries the signal the wrong way; it runs A → B.',
      );
    else
      e.add(
        'compatible',
        `Connect end ${selected.side.toUpperCase()} to this device; the signal travels A → B.`,
      );
  }
  const capability = (
    key: 'supportsVideo' | 'supportsData' | 'supportsCharging' | 'supportsPd' | 'supportsAltMode',
    label: string,
  ) => {
    if (cable[key] === undefined) e.unknown(label);
    else if (!cable[key]) e.add('incompatible', `Cable does not support ${label}.`);
    else e.add('compatible', `Cable supports ${label}.`);
  };
  if (connection.purpose === 'video') capability('supportsVideo', 'video');
  if (['data', 'network'].includes(connection.purpose)) capability('supportsData', 'data transfer');
  if (connection.purpose === 'charging') capability('supportsCharging', 'charging');
  for (const key of ['supportsPd', 'supportsAltMode'] as const)
    if (connection[key])
      capability(key, key === 'supportsPd' ? 'USB Power Delivery' : 'DisplayPort Alt Mode');
  for (const [key, unit] of [
    ['maxDataGbps', 'Gbps'],
    ['maxPowerW', 'W'],
  ] as const) {
    if (connection[key]) {
      if (!cable[key]) e.unknown(`cable capacity in ${unit}`);
      else if (cable[key]! < connection[key]!)
        e.add(
          connection.purpose === 'charging' ? 'limited' : 'incompatible',
          `${cable[key]}${unit} cable is below the requested ${connection[key]}${unit}${connection.purpose === 'charging' ? '; charging may be slower' : ''}.`,
        );
      else e.add('compatible', `${cable[key]}${unit} meets ${connection[key]}${unit} requested.`);
    }
  }
  for (const key of ['standard', 'usbVersion', 'thunderboltVersion', 'displayStandard'] as const) {
    if (connection[key] && cable[key]?.toLowerCase() !== connection[key]!.toLowerCase())
      e.unknown(`support for ${connection[key]} (version names alone do not prove performance)`);
  }
  for (const mode of connection.videoModes || []) {
    if (!cable.videoModes?.length)
      e.unknown(`${mode.width}×${mode.height} at ${mode.hz}Hz support`);
    else if (
      !cable.videoModes.some(
        (m) => m.width >= mode.width && m.height >= mode.height && m.hz >= mode.hz,
      )
    )
      e.add(
        'incompatible',
        `No recorded cable mode meets ${mode.width}×${mode.height} at ${mode.hz}Hz; a lower resolution or refresh rate may work.`,
      );
    else if (
      !cable.videoModes.some(
        (m) =>
          m.width >= mode.width &&
          m.height >= mode.height &&
          m.hz >= mode.hz &&
          (m.note || '').toLowerCase() === (mode.note || '').toLowerCase(),
      )
    )
      e.unknown(
        `color depth / compression conditions for ${mode.width}×${mode.height} at ${mode.hz}Hz`,
      );
    else
      e.add(
        'compatible',
        `Recorded mode supports ${mode.width}×${mode.height} at ${mode.hz}Hz. Verify the source, display, color depth and compression settings as well.`,
      );
  }
  if (['power', 'audio'].includes(connection.purpose))
    e.unknown(
      connection.purpose === 'power'
        ? 'mains voltage/current rating, grounding and plug region; this is a connector match only'
        : 'audio pinout and signal format',
    );
  return e.result;
}
export function check(
  device: Connectivity | null | undefined,
  accessory: Connectivity | null | undefined,
): CompatibilityResult {
  const e = evaluation('Power adapter comparison');
  Object.assign(e.result, checkPower(device?.power, accessory?.adapter));
  evidence(device, accessory, e);
  return e.result;
}
function cableResult(device: Connectivity, accessory: Connectivity, connection: Connection) {
  const e = evaluation('Cable comparison');
  Object.assign(e.result, checkCable(connection, accessory.cable!));
  evidence(device, accessory, e);
  return e.result;
}
export function findMatches(
  subject: Pick<InventoryItem, 'id' | 'connectivity'> &
    Partial<Pick<InventoryItem, 'status' | 'condition'>>,
  inventory: InventoryItem[],
): CompatibilityMatch[] {
  const own = subject.connectivity;
  if (!own) return [];
  const results: CompatibilityMatch[] = [];
  for (const item of inventory) {
    if (
      item.id === subject.id ||
      ['Sold', 'Archived', 'Broken'].includes(item.status) ||
      item.condition === 'For Parts'
    )
      continue;
    const other = item.connectivity;
    if (!other) continue;
    const add = (requirement: string, result: CompatibilityResult) =>
      results.push({
        itemId: item.id,
        name: item.name,
        location: item.locationName,
        quantity: item.quantity,
        availableQuantity: item.availableQuantity,
        requirement,
        result,
      });
    if (own.power && other.adapter) add('Power', check(own, other));
    if (own.adapter && other.power) add('Power', check(other, own));
    if (other.cable)
      for (const connection of own.connections || [])
        add(connection.label || connection.purpose, cableResult(own, other, connection));
    if (own.cable)
      for (const connection of other.connections || [])
        add(connection.label || connection.purpose, cableResult(other, own, connection));
  }
  if (subject.status === 'Broken' || subject.condition === 'For Parts')
    for (const match of results) {
      match.result.status = 'unsafe';
      match.result.reasons.unshift('This item is marked broken or for parts. Do not use it.');
    }
  // Rank only by satisfied requirements, then availability. Never invent a quality score.
  return results.sort(
    (a, b) =>
      severity[a.result.status] - severity[b.result.status] ||
      Number(b.availableQuantity > 0) - Number(a.availableQuantity > 0) ||
      a.name.localeCompare(b.name),
  );
}
export const compatibilityEngine = {
  check,
  checkPower,
  checkCable,
  findMatches,
  findCables: (device: InventoryItem, inventory: InventoryItem[]) =>
    findMatches(
      device,
      inventory.filter((i) => i.connectivity?.cable),
    ),
  findPowerAdapters: (device: InventoryItem, inventory: InventoryItem[]) =>
    findMatches(
      device,
      inventory.filter((i) => i.connectivity?.adapter),
    ),
};
