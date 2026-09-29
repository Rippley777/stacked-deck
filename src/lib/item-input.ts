import { itemSchema } from '../../shared/validation';
export function readItemForm(form: FormData, key: string, systemEntry: boolean) {
  const str = (name: string) => String(form.get(`${key}${name}`) || '');
  const cents = (name: string) => (str(name) === '' ? null : Math.round(Number(str(name)) * 100));
  const parsed = itemSchema.safeParse({
    kind: systemEntry ? 'System' : 'Component',
    systemSpecs: systemEntry
      ? {
          buildType: str('buildType'),
          processor: str('processor'),
          graphics: str('graphics'),
          memoryGB: str('memoryGB') ? Number(str('memoryGB')) : null,
          storage: str('storage'),
          motherboard: str('motherboard'),
          powerSupply: str('powerSupply'),
          operatingSystem: str('operatingSystem'),
        }
      : null,
    name: str('name'),
    manufacturer: str('manufacturer'),
    model: str('model'),
    category: str('category'),
    quantity: Number(str('quantity')),
    condition: str('condition'),
    status: str('status'),
    locationId: str('locationId') || null,
    tags: str('tags')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    notes: str('notes'),
    serialNumber: str('serialNumber'),
    purchaseDate: str('purchaseDate') || null,
    purchasePriceCents: cents('purchasePrice'),
    estimatedValueCents: cents('estimatedValue'),
    imageUrl: str('imageUrl'),
  });
  if (!parsed.success)
    throw new Error(
      `${str('name') || 'Hardware'}: ${parsed.error.issues[0].path.join(' ')} — ${parsed.error.issues[0].message}`,
    );
  return parsed.data;
}
