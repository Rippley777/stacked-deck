import { z } from 'zod';
import type { InventoryItem } from './types.js';
const positive = z.coerce.number().positive().max(1000000).optional();
export const connectivityFilterSchema = z.object({
  accessory: z.enum(['cable', 'adapter']).optional(),
  connector: z.string().max(160).optional(),
  minWatts: positive,
  voltage: positive,
  minGbps: positive,
  outerMm: positive,
  innerMm: positive,
  width: positive,
  height: positive,
  hz: positive,
  standard: z.string().max(160).optional(),
  video: z.enum(['true', 'false']).optional(),
  charging: z.enum(['true', 'false']).optional(),
});
export type ConnectivityFilter = z.infer<typeof connectivityFilterSchema>;
export function matchesConnectivity(item: InventoryItem, f: ConnectivityFilter) {
  const c = item.connectivity?.cable,
    a = item.connectivity?.adapter;
  if (f.accessory && !(f.accessory === 'cable' ? c : a)) return false;
  if (
    f.connector &&
    ![c?.a?.connector, c?.b?.connector, a?.connector?.connector].some(
      (v) => v?.toLowerCase() === f.connector!.toLowerCase(),
    )
  )
    return false;
  if (
    f.minWatts &&
    (f.accessory === 'adapter' ? (a?.wattage ?? 0) : (c?.maxPowerW ?? a?.wattage ?? 0)) < f.minWatts
  )
    return false;
  if (f.voltage && a?.voltage !== f.voltage && !a?.pdProfiles?.some((p) => p.voltage === f.voltage))
    return false;
  if (f.minGbps && (c?.maxDataGbps ?? 0) < f.minGbps) return false;
  if (
    (f.outerMm || f.innerMm) &&
    ![a?.connector, c?.a, c?.b].some(
      (e) =>
        e?.connector === 'DC barrel' &&
        (!f.outerMm || e.outerMm === f.outerMm) &&
        (!f.innerMm || e.innerMm === f.innerMm),
    )
  )
    return false;
  if (
    f.standard &&
    ![
      c?.standard,
      c?.usbVersion,
      c?.displayStandard,
      c?.thunderboltVersion,
      c?.ethernetCategory,
    ].some((v) => v?.toLowerCase() === f.standard!.toLowerCase())
  )
    return false;
  if (f.video && c?.supportsVideo !== (f.video === 'true')) return false;
  if (f.charging && c?.supportsCharging !== (f.charging === 'true')) return false;
  if (
    (f.width || f.height || f.hz) &&
    !c?.videoModes?.some(
      (m) =>
        (!f.width || m.width >= f.width) &&
        (!f.height || m.height >= f.height) &&
        (!f.hz || m.hz >= f.hz),
    )
  )
    return false;
  return true;
}
// Small, transparent grammar for common inventory questions; never calls AI.
export function parseCableQuery(query: string): { filters: ConnectivityFilter; text: string } {
  let text = query.toLowerCase().trim();
  const filters: ConnectivityFilter = {};
  // Preserve ordinary name/model searches, including legacy cables with no metadata.
  if (
    !/^(?:show|find)\b/.test(text) &&
    !/\d+(?:\.\d+)?\s*(?:w(?:atts?)?|v(?:olts?)?|gbps|hz|mm|k)\b/.test(text) &&
    !/\b(?:hdmi|displayport)\s+\d+\.\d+\s+cables?\b/.test(text)
  )
    return { filters, text };
  if (/\bcharging\b/.test(text)) filters.charging = 'true';
  const take = (re: RegExp, run: (m: RegExpMatchArray) => void) => {
    const m = text.match(re);
    if (m) {
      run(m);
      text = text.replace(m[0], ' ');
    }
  };
  take(/\b(?:usb[- ]?c|usb[- ]?a|hdmi|displayport|ethernet)\b(?:\s+(\d+\.\d+))?/, (m) => {
    const base = m[0].split(/\s/)[0];
    filters.connector = base.startsWith('usb')
      ? m[0].includes('a')
        ? 'USB-A'
        : 'USB-C'
      : base === 'ethernet'
        ? 'RJ45'
        : base === 'hdmi'
          ? 'HDMI'
          : 'DisplayPort';
    if (m[1]) filters.standard = `${filters.connector} ${m[1]}`;
  });
  take(/\b(\d+(?:\.\d+)?)\s*w(?:atts?)?\b/, (m) => {
    filters.minWatts = Number(m[1]);
  });
  take(/\b(\d+(?:\.\d+)?)\s*v(?:olts?)?\b/, (m) => {
    filters.voltage = Number(m[1]);
  });
  take(/\b(\d+(?:\.\d+)?)\s*gbps\b/, (m) => {
    filters.minGbps = Number(m[1]);
  });
  take(/\b(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:mm)?\b/, (m) => {
    filters.outerMm = Number(m[1]);
    filters.innerMm = Number(m[2]);
  });
  take(/\b([48])k\b/, (m) => {
    filters.width = Number(m[1]) === 4 ? 3840 : 7680;
    filters.height = Number(m[1]) === 4 ? 2160 : 4320;
  });
  take(/\b(\d+)\s*hz\b/, (m) => {
    filters.hz = Number(m[1]);
  });
  take(/\b(?:power\s+)?(?:adapters?|chargers?)\b/, () => {
    filters.accessory = 'adapter';
  });
  take(/\bcables?\b/, () => {
    filters.accessory = 'cable';
  });
  if (Object.keys(filters).length)
    text = text
      .replace(
        /\b(show|me|that|support|supports|can|run|capable|of|with|connectors?|charging|power)\b/g,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();
  return { filters, text };
}
export { possibleDuplicates } from './duplicates.js';
