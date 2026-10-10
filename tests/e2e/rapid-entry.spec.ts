import { test, expect, type Page, type Locator } from '@playwright/test';
import type { InventoryItem } from '../../shared/types';

async function register(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Inventory Keeper');
  await page.getByLabel('Email address').fill(`capture-${crypto.randomUUID()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('inventory-browser-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your hardware. Full of potential.' }),
  ).toBeVisible();
}
async function openHardware(page: Page) {
  await page.getByRole('button', { name: 'Add hardware', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Name *', { exact: true })).toBeVisible();
  return dialog;
}
async function inventory(page: Page): Promise<InventoryItem[]> {
  const response = await page.request.get('/api/inventory');
  expect(response.ok()).toBe(true);
  return (await response.json()).items;
}
const rapid = (dialog: Locator) =>
  dialog.getByRole('button', { name: 'Save & add another', exact: true });
const name = (dialog: Locator) => dialog.getByLabel('Name *', { exact: true });
const identity = [
  'Manufacturer',
  'Model',
  'Current value per unit ($)',
  'Purchase price per unit ($)',
  'Purchase date',
  'Serial number',
  'Photo URL',
  'Notes',
];
async function expectClean(dialog: Locator) {
  await expect(name(dialog)).toBeEmpty();
  for (const field of identity) await expect(dialog.getByLabel(field, { exact: true })).toBeEmpty();
  await expect(dialog.getByLabel('Quantity *', { exact: true })).toHaveValue('1');
  await expect(dialog.locator('input[name="connectivity"]')).toHaveValue('null');
  await expect(dialog.getByRole('button', { name: 'Discard AI estimate' })).toHaveCount(0);
  await expect(dialog.getByRole('alert')).toHaveCount(0);
}

test('capture ten consecutive items, update session defaults, and opt in/out of sticky category', async ({
  page,
}) => {
  test.setTimeout(60000);
  await register(page);
  const locations = [];
  for (const bin of ['Office → Closet → Shelf 2 → Bin 3', 'Office → Bin 4']) {
    const response = await page.request.post('/api/locations', {
      headers: { 'X-Stacked-Deck': '1' },
      data: { name: bin },
    });
    expect(response.ok()).toBe(true);
    locations.push((await response.json()).id as string);
  }
  const dialog = await openHardware(page);
  await expect(dialog.getByLabel('Keep category for next item')).not.toBeChecked();
  await dialog.getByLabel('Location', { exact: true }).selectOption(locations[0]);
  await dialog.getByLabel('Condition', { exact: true }).selectOption('Fair');
  await dialog.getByLabel('Base status').selectOption('Loaned');
  await dialog.getByLabel('Tags', { exact: true }).fill('office, shelf-2, spare');
  for (let i = 0; i < 10; i++) {
    if (i === 4) {
      await dialog.getByLabel('Location', { exact: true }).selectOption(locations[1]);
      await dialog.getByLabel('Condition', { exact: true }).selectOption('Like New');
      await dialog.getByLabel('Base status').selectOption('Available');
      await dialog.getByLabel('Tags', { exact: true }).fill('');
    }
    await name(dialog).fill(`Shelf item ${i + 1}`);
    await dialog.getByLabel('Category *', { exact: true }).fill('Cable');
    await dialog.getByLabel('Keep category for next item').setChecked(i >= 2 && i < 7);
    await dialog.getByLabel('Quantity *', { exact: true }).fill('2');
    for (const [field, value] of Object.entries({
      Manufacturer: 'Acme',
      Model: `Model ${i}`,
      'Current value per unit ($)': '20',
      'Purchase price per unit ($)': '30',
      'Purchase date': '2025-01-01',
      'Serial number': `SERIAL-${i}`,
      'Photo URL': 'https://example.com/photo.png',
      Notes: 'Individual item notes',
    })) {
      await dialog.getByLabel(field, { exact: true }).fill(value);
    }
    if (i % 3 === 0) await rapid(dialog).click();
    else await name(dialog).press(i % 3 === 1 ? 'Control+Enter' : 'Meta+Enter');
    await expect(
      dialog.getByText(`${i + 1} ${i === 0 ? 'item' : 'items'} added this session`, {
        exact: true,
      }),
    ).toBeVisible();
    await expectClean(dialog);
    await expect(name(dialog)).toBeFocused();
    await expect(name(dialog)).toBeInViewport();
    await expect(dialog.getByLabel('Location', { exact: true })).toHaveValue(
      locations[i < 4 ? 0 : 1],
    );
    await expect(dialog.getByLabel('Condition', { exact: true })).toHaveValue(
      i < 4 ? 'Fair' : 'Like New',
    );
    await expect(dialog.getByLabel('Base status')).toHaveValue(i < 4 ? 'Loaned' : 'Available');
    await expect(dialog.getByLabel('Tags', { exact: true })).toHaveValue(
      i < 4 ? 'office, shelf-2, spare' : '',
    );
    await expect(dialog.getByLabel('Category *', { exact: true })).toHaveValue(
      i >= 2 && i < 7 ? 'Cable' : 'Raspberry Pi',
    );
    const items = await inventory(page);
    expect(items).toHaveLength(i + 1);
    expect(items.find((item) => item.name === `Shelf item ${i + 1}`)).toMatchObject({
      quantity: 2,
      locationId: locations[i < 4 ? 0 : 1],
      category: 'Cable',
      serialNumber: `SERIAL-${i}`,
    });
  }
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await openHardware(page);
  await expect(dialog.getByText(/added this session/)).toHaveCount(0);
  await expect(dialog.getByLabel('Location', { exact: true })).toHaveValue('');
  await expect(dialog.getByLabel('Condition', { exact: true })).toHaveValue('Good');
  await expect(dialog.getByLabel('Base status')).toHaveValue('Available');
  await expect(dialog.getByLabel('Tags', { exact: true })).toBeEmpty();
  await expect(dialog.getByLabel('Keep category for next item')).not.toBeChecked();
});

test('normal save and Enter still close; editing and computers have no rapid action', async ({
  page,
}) => {
  await register(page);
  const dialog = await openHardware(page);
  await name(dialog).fill('Normal item');
  await dialog.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const [saved] = await inventory(page);
  expect(saved.name).toBe('Normal item');
  await openHardware(page);
  await name(dialog).fill('Enter item');
  await name(dialog).press('Enter');
  await expect(dialog).toHaveCount(0);
  expect(await inventory(page)).toHaveLength(2);
  await page.goto(`/deck?item=${saved.id}`);
  await dialog.getByRole('button', { name: 'Edit hardware', exact: true }).click();
  await expect(rapid(dialog)).toHaveCount(0);
  await expect(dialog.getByLabel('Keep category for next item')).toHaveCount(0);
  await expect(dialog.getByText(/added this session/)).toHaveCount(0);
  await name(dialog).fill('Edited item');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByRole('button', { name: 'Edit hardware' })).toBeVisible();
  expect((await inventory(page)).find((item) => item.id === saved.id)?.name).toBe('Edited item');
  await page.goto('/systems?add=1');
  await expect(dialog.getByRole('button', { name: 'Add computer', exact: true })).toBeVisible();
  await expect(rapid(dialog)).toHaveCount(0);
  await expect(dialog.getByLabel('Keep category for next item')).toHaveCount(0);
});

test('failed saves preserve values and count; validation and duplicate submission guards hold', async ({
  page,
}) => {
  await register(page);
  const dialog = await openHardware(page);
  await rapid(dialog).click();
  await expect(name(dialog)).toBeFocused();
  expect(await inventory(page)).toHaveLength(0);
  await name(dialog).fill('First success');
  await rapid(dialog).click();
  await expect(dialog.getByText('1 item added this session', { exact: true })).toBeVisible();
  await name(dialog).fill('Retry this item');
  await dialog.getByLabel('Tags', { exact: true }).fill('keep-me');
  await dialog.getByLabel('Notes', { exact: true }).fill('Do not lose this');
  await dialog.getByLabel('Condition', { exact: true }).selectOption('Fair');
  await dialog.getByLabel('Category *', { exact: true }).fill('SSD');
  await dialog.getByLabel('Keep category for next item').check();
  let attempts = 0;
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/inventory', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    attempts++;
    await pending;
    await route.fulfill({
      status: 503,
      json: { error: 'Inventory temporarily unavailable. Try again.' },
    });
  });
  await rapid(dialog).click();
  await expect(rapid(dialog)).toBeDisabled();
  // Force multiple same-turn submit events as well as repeated shortcut input.
  await dialog.locator('form').evaluate((form: HTMLFormElement) => {
    for (let i = 0; i < 3; i++)
      form.dispatchEvent(new SubmitEvent('submit', { bubbles: true, cancelable: true }));
  });
  await page.keyboard.press('Control+Enter');
  await page.keyboard.press('Meta+Enter');
  release();
  await expect(dialog.getByRole('alert')).toContainText('Inventory temporarily unavailable');
  expect(attempts).toBe(1);
  await expect(name(dialog)).toHaveValue('Retry this item');
  await expect(dialog.getByLabel('Tags', { exact: true })).toHaveValue('keep-me');
  await expect(dialog.getByLabel('Notes', { exact: true })).toHaveValue('Do not lose this');
  await expect(dialog.getByLabel('Condition', { exact: true })).toHaveValue('Fair');
  await expect(dialog.getByLabel('Keep category for next item')).toBeChecked();
  await expect(dialog.getByText('1 item added this session', { exact: true })).toBeVisible();
  expect(await inventory(page)).toHaveLength(1);
  await page.unroute('**/api/inventory');
  await rapid(dialog).click();
  await expect(dialog.getByText('2 items added this session', { exact: true })).toBeVisible();
  await expectClean(dialog);
  await expect(dialog.getByLabel('Category *', { exact: true })).toHaveValue('SSD');
  expect(await inventory(page)).toHaveLength(2);
});

const photo = {
  name: 'hardware.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
    'base64',
  ),
};
const valuation = {
  estimatedValueCents: 1500,
  lowEstimateCents: 1000,
  highEstimateCents: 2000,
  confidence: 'medium',
  currency: 'USD',
  explanation: 'Test estimate from the label.',
};
const suggestion = {
  name: 'Scanned supply',
  category: 'Power Adapter',
  manufacturer: 'Acme',
  model: '12V',
  serialNumber: 'SCAN-1',
  quantity: 3,
  notes: 'Label visible',
  evidence: '12V printed on label',
  confidence: 'high',
  valuation,
  connectivity: { version: 1, verified: false, adapter: { voltage: 12 } },
};

test('scanner photos, errors, used suggestions, connectivity and both AI valuation sources reset', async ({
  page,
}) => {
  await page.route('**/api/hardware/scan', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'GET'
          ? { enabled: true }
          : { items: [suggestion], message: '' },
    }),
  );
  await page.route('**/api/hardware/valuation', (route) =>
    route.fulfill({ json: { valuation, message: '' } }),
  );
  await register(page);
  const dialog = await openHardware(page);
  await dialog.getByLabel('Upload hardware photo').setInputFiles(photo);
  await dialog.getByRole('button', { name: 'Scan photo', exact: true }).click();
  await dialog.getByRole('button', { name: 'Use these details' }).click();
  await expect(dialog.getByRole('button', { name: 'Added to form' })).toBeDisabled();
  await expect(dialog.getByRole('button', { name: 'Discard AI estimate' })).toBeVisible();
  await expect(dialog.getByLabel('Voltage (V)', { exact: true })).toHaveValue('12');
  await rapid(dialog).click();
  await expect(dialog.getByText('1 item added this session', { exact: true })).toBeVisible();
  await expectClean(dialog);
  await expect(dialog.getByRole('img', { name: 'Hardware photo to scan' })).toHaveCount(0);
  await expect(dialog.getByLabel('Scan suggestions')).toHaveCount(0);
  await expect(dialog.getByRole('button', { name: 'Added to form' })).toHaveCount(0);
  await name(dialog).fill('Plain next item');
  await rapid(dialog).click();
  await expect(dialog.getByText('2 items added this session', { exact: true })).toBeVisible();
  const items = await inventory(page);
  expect(items.find((item) => item.name === 'Scanned supply')).toMatchObject({
    connectivity: { adapter: { voltage: 12 } },
    aiValuation: { estimatedValueCents: 1500 },
  });
  expect(items.find((item) => item.name === 'Plain next item')).toMatchObject({
    connectivity: null,
    aiValuation: null,
    quantity: 1,
    serialNumber: '',
  });
  // A new scan can use the same suggestion again.
  await dialog.getByLabel('Upload hardware photo').setInputFiles(photo);
  await dialog.getByRole('button', { name: 'Scan photo', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Use these details' })).toBeEnabled();
  await name(dialog).fill('Draft estimate item');
  await dialog.getByRole('button', { name: 'Estimate value', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Discard AI estimate' })).toBeVisible();
  await page.route('**/api/hardware/scan', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({ json: { enabled: true } })
      : route.fulfill({ status: 502, json: { error: 'Scan failed' } }),
  );
  await dialog.getByRole('button', { name: 'Scan photo', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Scan failed');
  await rapid(dialog).click();
  await expect(dialog.getByText('3 items added this session', { exact: true })).toBeVisible();
  await expectClean(dialog);
});

test('shortcut waits for scanning and valuation and stays inside its dialog', async ({ page }) => {
  let releaseScan!: () => void;
  const scanning = new Promise<void>((resolve) => {
    releaseScan = resolve;
  });
  let releaseValue!: () => void;
  const valuing = new Promise<void>((resolve) => {
    releaseValue = resolve;
  });
  await page.route('**/api/hardware/scan', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true } });
    await scanning;
    await route.fulfill({ json: { items: [suggestion], message: '' } });
  });
  await page.route('**/api/hardware/valuation', async (route) => {
    await valuing;
    await route.fulfill({ json: { valuation, message: '' } });
  });
  await register(page);
  const dialog = await openHardware(page);
  await name(dialog).fill('Busy item');
  await dialog.getByLabel('Upload hardware photo').setInputFiles(photo);
  await dialog.getByRole('button', { name: 'Scan photo', exact: true }).click();
  await expect(rapid(dialog)).toBeDisabled();
  await name(dialog).press('Control+Enter');
  expect(await inventory(page)).toHaveLength(0);
  releaseScan();
  await expect(rapid(dialog)).toBeEnabled();
  await dialog.getByRole('button', { name: 'Estimate value', exact: true }).click();
  await expect(rapid(dialog)).toBeDisabled();
  await page.keyboard.press('Meta+Enter');
  expect(await inventory(page)).toHaveLength(0);
  releaseValue();
  await expect(rapid(dialog)).toBeEnabled();
  // A nested native dialog represents a confirmation that owns keyboard focus.
  await dialog.locator('form').evaluate((form) => {
    const confirmation = document.createElement('dialog');
    confirmation.setAttribute('aria-label', 'Confirmation');
    confirmation.innerHTML = '<button type="button">Confirm</button>';
    form.append(confirmation);
    confirmation.showModal();
  });
  await page.getByRole('button', { name: 'Confirm', exact: true }).press('Control+Enter');
  expect(await inventory(page)).toHaveLength(0);
  await page.getByRole('dialog', { name: 'Confirmation' }).evaluate((el) => {
    (el as HTMLDialogElement).close();
    el.remove();
  });
  await name(dialog).press('Control+Enter');
  await expect(dialog.getByText('1 item added this session', { exact: true })).toBeVisible();
});

test.describe('mobile capture', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  test('touch actions fit the viewport and rapid save returns to the start without focusing a text input', async ({
    page,
  }, info) => {
    await register(page);
    const dialog = await openHardware(page);
    await name(dialog).fill('Mobile item A');
    for (const label of ['Add hardware', 'Save & add another']) {
      const button = dialog.getByRole('button', { name: label, exact: true });
      await expect(button).toBeInViewport();
      const box = await button.boundingBox();
      expect(box!.height).toBeGreaterThanOrEqual(44);
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(390);
    }
    expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
    await rapid(dialog).click();
    await expect(dialog.getByText('1 item added this session', { exact: true })).toBeVisible();
    await expectClean(dialog);
    await expect(dialog.locator('.form-intro')).toBeFocused();
    expect(await dialog.evaluate((el) => el.scrollTop)).toBe(0);
    await page.screenshot({ path: info.outputPath('rapid-entry-mobile.png') });
    await name(dialog).fill('Mobile item B');
    await dialog.getByRole('button', { name: 'Add hardware', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(await inventory(page)).toHaveLength(2);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  });
});
