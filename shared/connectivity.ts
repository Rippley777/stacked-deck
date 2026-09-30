import { z } from 'zod';

// IDs are stored as strings: adding a connector never requires a database migration.
export const connectors = [
  'USB-A',
  'USB-B',
  'USB-C',
  'Mini USB',
  'Micro USB',
  'Lightning',
  'HDMI',
  'Mini HDMI',
  'Micro HDMI',
  'DisplayPort',
  'Mini DisplayPort',
  'RJ45',
  '3.5mm',
  '6.35mm',
  'RCA',
  'XLR',
  'MIDI',
  'TOSLINK',
  'IEC C5',
  'IEC C6',
  'IEC C7',
  'IEC C8',
  'IEC C13',
  'IEC C14',
  'IEC C19',
  'IEC C20',
  'AC plug',
  'DC barrel',
  'MagSafe',
  'Proprietary',
  'Unknown',
] as const;
const text = z.string().trim().max(160);
const number = z.number().positive().max(1000000);
const flag = z.boolean().optional();
export const endpointSchema = z.object({
  connector: text.min(1).optional(),
  gender: z.enum(['male', 'female']).optional(),
  outerMm: number.optional(),
  innerMm: number.optional(),
});
export const pdProfileSchema = z.object({
  voltage: z.number().min(5).max(48),
  current: z.number().positive().max(5),
});
export const videoModeSchema = z.object({
  width: number.int(),
  height: number.int(),
  hz: number,
  note: text.optional(),
});
const capabilities = {
  standard: text.optional(),
  usbVersion: text.optional(),
  thunderboltVersion: text.optional(),
  displayStandard: text.optional(),
  maxDataGbps: number.optional(),
  maxPowerW: number.optional(),
  supportsPd: flag,
  supportsVideo: flag,
  supportsData: flag,
  supportsCharging: flag,
  supportsAltMode: flag,
  videoModes: z.array(videoModeSchema).max(20).optional(),
};
export const cableSchema = z.object({
  family: z.enum(['usb', 'video', 'network', 'audio', 'power', 'other']).optional(),
  a: endpointSchema.optional(),
  b: endpointSchema.optional(),
  ...capabilities,
  ethernetCategory: text.optional(),
  lengthM: number.optional(),
  active: flag,
  directional: flag,
  // A directional cable always carries signals from A to B.
  maxVoltage: number.optional(),
  maxCurrent: number.optional(),
  certification: text.optional(),
  notes: z.string().max(1000).optional(),
});
const electrical = {
  connector: endpointSchema.optional(),
  voltage: number.optional(),
  current: number.optional(),
  wattage: number.optional(),
  acDc: z.enum(['AC', 'DC']).optional(),
  polarity: z.enum(['center_positive', 'center_negative']).optional(),
  pd: flag,
  pdProfiles: z.array(pdProfileSchema).max(20).optional(),
  // "none" means explicitly confirmed to require no proprietary handshake.
  proprietaryProtocol: text.optional(),
  frequencyHz: number.optional(),
};
export const adapterSchema = z.object({
  ...electrical,
  inputVoltage: text.optional(),
  inputFrequency: text.optional(),
  inputCurrent: number.optional(),
  outputMode: z.enum(['fixed', 'variable']).optional(),
  quickCharge: text.optional(),
  gan: flag,
  ports: number.int().max(100).optional(),
  perPortW: number.optional(),
});
export const powerRequirementSchema = z.object({
  ...electrical,
  recommendedW: number.optional(),
  includedAdapterModel: text.optional(),
});
export const connectionSchema = z.object({
  label: text.optional(),
  purpose: z.enum(['video', 'data', 'network', 'audio', 'charging', 'power']),
  port: endpointSchema,
  sourcePort: endpointSchema.optional(),
  role: z.enum(['input', 'output', 'bidirectional']).optional(),
  ...capabilities,
  count: number.int().max(100).optional(),
});
export const connectivitySchema = z.object({
  version: z.literal(1),
  verified: flag,
  evidence: z.string().max(1500).optional(),
  cable: cableSchema.optional(),
  adapter: adapterSchema.optional(),
  power: powerRequirementSchema.optional(),
  connections: z.array(connectionSchema).max(30).optional(),
});
export type Connectivity = z.infer<typeof connectivitySchema>;
export type Endpoint = z.infer<typeof endpointSchema>;
export type CableDetails = z.infer<typeof cableSchema>;
export type PowerAdapter = z.infer<typeof adapterSchema>;
export type PowerRequirement = z.infer<typeof powerRequirementSchema>;
export type Connection = z.infer<typeof connectionSchema>;
export type CompatibilityStatus =
  'compatible' | 'limited' | 'uncertain' | 'incompatible' | 'unsafe';
export const statusLabels: Record<CompatibilityStatus, string> = {
  compatible: '✓ Compatible',
  limited: '⚠ Compatible with limitations',
  uncertain: '? Compatibility uncertain',
  incompatible: '✕ Incompatible',
  unsafe: '⚠ Unsafe — DO NOT USE',
};
export interface CompatibilityResult {
  status: CompatibilityStatus;
  reasons: string[];
  verify: string[];
  scope: string;
}
export interface CompatibilityMatch {
  itemId: string;
  name: string;
  location: string | null;
  quantity: number;
  availableQuantity: number;
  requirement: string;
  result: CompatibilityResult;
}
