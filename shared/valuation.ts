import { z } from 'zod';

export const valuationLimits = {
  timeoutMs: 45_000,
  requestsPerHour: 20,
  windowMs: 60 * 60 * 1000,
  cooldownMs: 60_000,
  staleAfterMs: 7 * 24 * 60 * 60 * 1000,
} as const;
export const centsSchema = z.number().int().min(0).max(1_000_000_000);
// Keep the provider schema free of refinements; validate relationships locally.
export const valuationOutputSchema = z.object({
  estimatedValueCents: centsSchema,
  lowEstimateCents: centsSchema,
  highEstimateCents: centsSchema,
  confidence: z.enum(['low', 'medium', 'high']),
  currency: z.literal('USD'),
  explanation: z.string().trim().min(1).max(600),
});
export const valuationSchema = valuationOutputSchema.refine(
  (v) =>
    v.lowEstimateCents <= v.estimatedValueCents && v.estimatedValueCents <= v.highEstimateCents,
  'The estimate must fall inside its low/high range.',
);
export type Valuation = z.infer<typeof valuationSchema>;
export interface ValuationRecord {
  id: string;
  itemId: string;
  valuation: Valuation | null;
  effectiveValueCents: number | null;
  source: 'ai' | 'manual';
  provider: string;
  inputFingerprint: string;
  createdAt: string;
  appliedAt: string | null;
}
export interface ValuePoint {
  date: string;
  valueCents: number;
}
export interface PortfolioEvent {
  sequence: number;
  itemId: string;
  valueCents: number;
  createdAt: string;
}
export interface Portfolio {
  totalValueCents: number;
  totalSpentCents: number;
  gainCents: number;
  gainPercent: number | null;
  comparableGainCents: number;
  comparableGainPercent: number | null;
  missingValues: { id: string; name: string }[];
  missingPurchasePrices: number;
  categories: { name: string; valueCents: number }[];
  mostValuable: { id: string; name: string; valueCents: number } | null;
  history: ValuePoint[];
}
export function gain(value: number | null, cost: number | null) {
  return {
    cents: value === null || cost === null ? null : value - cost,
    percent: value === null || cost === null || cost === 0 ? null : ((value - cost) / cost) * 100,
  };
}
