import { z } from 'zod';
import { valuationSchema } from './valuation.js';
import {
  buildTypes,
  conditions,
  itemStatuses,
  projectStatuses,
  systemCategories,
} from './types.js';
const short = z.string().trim().max(160);
const money = z.number().int().min(0).max(1_000_000_000).nullable();
const tags = z
  .array(z.string().trim().min(1).max(60))
  .max(30)
  .transform((v) => [...new Set(v.map((s) => s.toLowerCase()))]);
export const registerSchema = z.object({
  name: short.min(1),
  email: z
    .email()
    .max(254)
    .transform((v) => v.toLowerCase()),
  password: z.string().min(12, 'Use at least 12 characters.').max(128),
});
export const loginSchema = registerSchema
  .pick({ email: true })
  .extend({ password: z.string().min(1).max(128) });
export const systemSpecsSchema = z.object({
  buildType: z.enum(buildTypes).default('Prebuilt'),
  processor: short.default(''),
  graphics: short.default(''),
  memoryGB: z.number().min(0.5).max(16384).nullable().default(null),
  storage: z.string().trim().max(500).default(''),
  motherboard: short.default(''),
  powerSupply: short.default(''),
  operatingSystem: short.default(''),
});
export const itemSchema = z
  .object({
    initialValuation: valuationSchema.nullable().optional(),
    kind: z.enum(['Component', 'System']).default('Component'),
    systemSpecs: systemSpecsSchema.nullable().default(null),
    name: short.min(1),
    manufacturer: short.default(''),
    model: short.default(''),
    category: short.min(1),
    quantity: z.number().int().min(1).max(100000),
    condition: z.enum(conditions),
    status: z.enum(itemStatuses),
    locationId: z.string().max(80).nullable().default(null),
    notes: z.string().max(10000).default(''),
    purchasePriceCents: money.default(null),
    estimatedValueCents: money.default(null),
    purchaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((s) => {
        const date = new Date(s);
        return !isNaN(date.getTime()) && date.toISOString().slice(0, 10) === s;
      }, 'Enter a valid date.')
      .nullable()
      .default(null),
    serialNumber: short.default(''),
    tags: tags.default([]),
    imageUrl: z
      .union([
        z.literal(''),
        z
          .url()
          .max(2048)
          .refine(
            (s) => ['http:', 'https:'].includes(new URL(s).protocol),
            'Use an HTTP or HTTPS image URL.',
          ),
      ])
      .default(''),
  })
  .superRefine((item, ctx) => {
    if (item.kind === 'System') {
      if (item.quantity !== 1)
        ctx.addIssue({
          code: 'custom',
          path: ['quantity'],
          message: 'Catalog each computer separately with quantity 1.',
        });
      if (!systemCategories.some((category) => category === item.category))
        ctx.addIssue({ code: 'custom', path: ['category'], message: 'Choose a computer type.' });
      if (!item.systemSpecs)
        ctx.addIssue({ code: 'custom', path: ['systemSpecs'], message: 'Add a system profile.' });
    } else if (item.systemSpecs)
      ctx.addIssue({
        code: 'custom',
        path: ['systemSpecs'],
        message: 'System specifications belong to a complete computer.',
      });
  });
export const systemWithComponentsSchema = z.object({
  system: itemSchema.refine((item) => item.kind === 'System', 'Choose a complete computer.'),
  components: z
    .array(
      itemSchema.refine(
        (item) => item.kind === 'Component' && item.status === 'Available',
        'New installed parts must be components with an Available base status.',
      ),
    )
    .min(1)
    .max(50),
});
export const requirementSchema = z
  .object({
    name: short.min(1),
    categories: z.array(short.min(1)).max(30),
    tags: tags.default([]),
    quantity: z.number().int().min(1).max(10000),
    optional: z.boolean().default(false),
    estimatedUnitCostCents: z.number().int().min(0).max(1_000_000_000).default(0),
  })
  .refine((r) => r.categories.length + r.tags.length > 0, 'Add a category or tag to match.');
export const projectSchema = z.object({
  name: short.min(1),
  description: z.string().max(3000).default(''),
  status: z.enum(projectStatuses),
  notes: z.string().max(10000).default(''),
  estimatedCostCents: money.default(null),
  requirements: z.array(requirementSchema).max(50).default([]),
});
export const locationSchema = z.object({
  name: short.min(1),
  description: z.string().max(500).default(''),
});
export const assignmentSchema = z.object({
  itemId: z.string().min(1).max(80),
  quantity: z.number().int().min(1).max(100000),
});
export type ItemInput = z.infer<typeof itemSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
