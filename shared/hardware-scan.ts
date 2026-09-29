import { z } from 'zod';
import { valuationSchema, valuationOutputSchema } from './valuation.js';
import { defaultCategories } from './types.js';

export const MAX_SCAN_BYTES = 4 * 1024 * 1024;
export const hardwareSuggestionSchema = z.object({
  valuation: valuationSchema.nullable().optional(),
  name: z.string().trim().min(1).max(160),
  category: z.enum(defaultCategories),
  manufacturer: z.string().max(160),
  model: z.string().max(160),
  serialNumber: z.string().max(160),
  quantity: z.number().int().min(1).max(100),
  notes: z.string().max(1500),
  confidence: z.enum(['low', 'medium', 'high']),
  evidence: z.string().max(600),
});
export const hardwareScanSchema = z.object({
  items: z.array(hardwareSuggestionSchema).max(10),
  message: z.string().max(1000),
});
export type HardwareSuggestion = z.infer<typeof hardwareSuggestionSchema>;
export type HardwareScan = z.infer<typeof hardwareScanSchema>;

export const hardwareScanProviderSchema = hardwareScanSchema.extend({
  items: z
    .array(hardwareSuggestionSchema.extend({ valuation: valuationOutputSchema.nullable() }))
    .max(10),
});
