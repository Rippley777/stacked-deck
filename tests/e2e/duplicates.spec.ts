import { test, expect, type Page } from '@playwright/test';
const headers = { 'X-Stacked-Deck': '1' };
const input = {
  name: 'Raspberry Pi 4 Model B 8GB',
  manufacturer: 'Raspberry Pi',
  model: '4 Model B 8GB',
  category: 'Raspberry Pi',
  quantity: 3,
  condition: 'Good',
  status: 'Available',
};
async function register(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Duplicate Keeper');
  await page.getByLabel('Email address').fill(`duplicates-${crypto.randomUUID()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('duplicate-browser-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your hardware. Full of potential.' }),
  ).toBeVisible();
}
async function create(page: Page, extra = {}) {
  const response = await page.request.post('/api/inventory', {
    headers,
    data: { ...input, ...extra },
  });
  expect(response.ok()).toBe(true);
  return response.json();
}
async function open(page: Page) {
  await page.getByRole('button', { name: 'Add hardware', exact: true }).first().click();
  return page.getByRole('dialog');
}
const matches = (page: Page) => page.getByRole('region', { name: 'Possible matches in your deck' });
async function identify(page: Page, model = input.model) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name *', { exact: true }).fill(input.name);
  await dialog.getByLabel('Manufacturer', { exact: true }).fill(input.manufacturer);
  await dialog.getByLabel('Model', { exact: true }).fill(model);
}

test('exact serial warning opens the existing card and allows separate rapid entry with a clean reset', async ({
  page,
}) => {
  await register(page);
  const existing = await create(page, { serialNumber: 'ABC123' });
  const dialog = await open(page);
  await dialog.getByLabel('Name *', { exact: true }).fill('Another physical unit');
  await dialog.getByLabel('Serial number', { exact: true }).fill(' abc123 ');
  await expect(matches(page).getByText('Exact serial match', { exact: true })).toBeVisible();
  await expect(matches(page).getByRole('alert')).toContainText('This may already be in your deck');
  await expect(matches(page).getByRole('button', { name: 'Add to existing quantity' })).toHaveCount(
    0,
  );
  const popupPromise = page.waitForEvent('popup');
  await matches(page).getByRole('link', { name: 'View item' }).click();
  const popup = await popupPromise;
  await expect(popup).toHaveURL(new RegExp(`item=${existing.id}`));
  await expect(popup.getByRole('dialog').getByRole('heading', { name: input.name })).toBeVisible();
  await popup.close();
  await expect(dialog.getByLabel('Name *', { exact: true })).toHaveValue('Another physical unit');
  await matches(page).getByRole('button', { name: 'Create separate card anyway' }).click();
  await dialog.getByRole('button', { name: 'Save & add another', exact: true }).click();
  await expect(dialog.getByLabel('Name *', { exact: true })).toHaveValue('');
  await expect(matches(page)).toHaveCount(0);
  await expect(dialog.getByText('1 item added this session', { exact: true })).toBeVisible();
  await dialog.getByLabel('Serial number', { exact: true }).fill('ABC123');
  await expect(matches(page).getByText('Exact serial match', { exact: true })).toHaveCount(2);
});

test('mobile quantity review deliberately adds 1 to 3 and retains only the existing card', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await register(page);
  const existing = await create(page);
  await open(page);
  await identify(page);
  await expect(matches(page).getByText('Strong match', { exact: true })).toBeVisible();
  await matches(page).getByRole('button', { name: 'Add to existing quantity' }).click();
  await expect(matches(page).getByLabel('Add quantity', { exact: true })).toHaveValue('1');
  await expect(matches(page).getByText('3 → 4', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog')).toBeVisible();
  await matches(page).scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'test-results/manual-duplicates-mobile.png' });
  expect(await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await matches(page).getByRole('button', { name: 'Confirm quantity addition' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const result = await (await page.request.get('/api/inventory')).json();
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ id: existing.id, quantity: 4 });
});

test('different serials, locations, archived cards and changed metadata steer toward separate cards', async ({
  page,
}) => {
  await register(page);
  const office = await (
    await page.request.post('/api/locations', { headers, data: { name: 'Office → Cable Drawer' } })
  ).json();
  const bedroom = await (
    await page.request.post('/api/locations', { headers, data: { name: 'Bedroom → Desk' } })
  ).json();
  await create(page, { serialNumber: 'SERIAL-A', locationId: office.id });
  await create(page, { name: 'Previous Pi', status: 'Archived', locationId: office.id });
  const dialog = await open(page);
  await identify(page);
  await dialog.getByLabel('Serial number', { exact: true }).fill('SERIAL-B');
  await dialog.getByLabel('Location', { exact: true }).selectOption(bedroom.id);
  await expect(matches(page).getByText(/Same model, different serial number/)).toBeVisible();
  await expect(matches(page).getByText('You previously had this item · Archived')).toBeVisible();
  await expect(
    matches(page)
      .getByText(/The item you’re adding is in Bedroom → Desk/)
      .first(),
  ).toBeVisible();
  await expect(matches(page).getByText('Exact serial match', { exact: true })).toHaveCount(0);
  await expect(matches(page).getByRole('button', { name: 'Add to existing quantity' })).toHaveCount(
    0,
  );
  await dialog.getByLabel('Serial number', { exact: true }).fill('');
  await expect(matches(page).getByText(/Restore or edit this card/)).toBeVisible();
});

test('debounces changes, ignores weak drafts and discards out of order results even when fetch cannot abort', async ({
  page,
}) => {
  await register(page);
  await create(page, { model: 'OLDER-MODEL', name: 'Older result' });
  await create(page, { model: 'NEWER-MODEL', name: 'Newer result' });
  const calls: string[] = [];
  let releaseOld!: () => void;
  const oldGate = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  await page.route('**/api/hardware/duplicates', async (route) => {
    const draft = route.request().postDataJSON();
    calls.push(draft.model);
    const result = await route.fetch();
    if (draft.model === 'OLDER-MODEL') await oldGate;
    await route.fulfill({ response: result });
  });
  // Simulate a transport that ignores AbortSignal; response generation must still be guarded.
  await page.evaluate(() => {
    const original = window.fetch;
    window.fetch = (url, options) =>
      original(
        url,
        String(url).endsWith('/hardware/duplicates') ? { ...options, signal: undefined } : options,
      );
  });
  const dialog = await open(page);
  await dialog.getByLabel('Name *', { exact: true }).fill('USB cable');
  await page.waitForTimeout(600);
  expect(calls).toEqual([]);
  await dialog.getByLabel('Model', { exact: true }).fill('OLD');
  await dialog.getByLabel('Model', { exact: true }).fill('OLDER-MODEL');
  expect(calls).toEqual([]);
  await expect.poll(() => calls).toEqual(['OLDER-MODEL']);
  await dialog.getByLabel('Model', { exact: true }).fill('NEWER-MODEL');
  await expect(matches(page).getByText('Newer result', { exact: true })).toBeVisible();
  releaseOld();
  await page.waitForTimeout(250);
  await expect(matches(page).getByText('Older result', { exact: true })).toHaveCount(0);
  await dialog.getByLabel('Model', { exact: true }).fill('');
  await expect(matches(page)).toHaveCount(0);
});

test('only shows three matches initially and clears quantity selection when draft changes or resets', async ({
  page,
}) => {
  await register(page);
  for (let n = 0; n < 5; n++) await create(page, { name: `Pi card ${n}` });
  const dialog = await open(page);
  await identify(page);
  await expect(matches(page).getByRole('article')).toHaveCount(3);
  await matches(page)
    .getByRole('button', { name: /View more matches/ })
    .click();
  await expect(matches(page).getByRole('article')).toHaveCount(5);
  await matches(page).getByRole('button', { name: 'Add to existing quantity' }).first().click();
  await dialog.getByLabel('Model', { exact: true }).fill('Different model');
  await expect(matches(page)).toHaveCount(0);
  await dialog.getByLabel('Model', { exact: true }).fill(input.model);
  await expect(matches(page).getByRole('article')).toHaveCount(3);
  await expect(matches(page).getByLabel('Add quantity')).toHaveCount(0);
  await matches(page).getByRole('button', { name: 'Add to existing quantity' }).first().click();
  await dialog.getByRole('button', { name: 'Save & add another', exact: true }).click();
  await expect(dialog.getByLabel('Name *', { exact: true })).toHaveValue('');
  await expect(matches(page)).toHaveCount(0);
  await identify(page);
  await expect(matches(page).getByRole('article')).toHaveCount(3);
  await expect(matches(page).getByLabel('Add quantity')).toHaveCount(0);
});

test('lookup and merge failures preserve the draft and leave normal save available', async ({
  page,
}) => {
  await register(page);
  await create(page);
  const dialog = await open(page);
  await page.route('**/api/hardware/duplicates', (route) =>
    route.fulfill({ status: 503, json: { error: 'Temporarily unavailable.' } }),
  );
  await identify(page);
  await expect(dialog.getByText(/Could not check your deck/)).toBeVisible();
  await page.unroute('**/api/hardware/duplicates');
  await dialog.getByLabel('Model', { exact: true }).fill('4 Model B 8GB ');
  await matches(page).getByRole('button', { name: 'Add to existing quantity' }).click();
  await page.route('**/api/inventory/*', (route) =>
    route.request().method() === 'PUT'
      ? route.fulfill({
          status: 409,
          json: { error: 'This card was assigned. Create a separate card.' },
        })
      : route.continue(),
  );
  await matches(page).getByRole('button', { name: 'Confirm quantity addition' }).click();
  await expect(dialog.getByRole('alert')).toContainText('This card was assigned');
  await expect(dialog.getByLabel('Name *', { exact: true })).toHaveValue(input.name);
  await dialog.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(dialog).toHaveCount(0);
});

test('AI suggestions without connectivity share serial matching with the manual form', async ({
  page,
}) => {
  const suggestion = {
    ...input,
    serialNumber: 'SCAN123',
    quantity: 1,
    notes: '',
    evidence: 'Readable label',
    confidence: 'high',
  };
  await page.route('**/api/hardware/scan', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'GET'
          ? { enabled: true }
          : { items: [suggestion], message: '' },
    }),
  );
  await register(page);
  await create(page, { serialNumber: 'scan123' });
  const dialog = await open(page);
  await dialog.getByLabel('Upload hardware photo').setInputFiles({
    name: 'label.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
      'base64',
    ),
  });
  await dialog.getByRole('button', { name: 'Scan photo', exact: true }).click();
  await expect(dialog.getByText('You may already own 3 of these.')).toBeVisible();
  await expect(dialog.locator('.scan-inventory')).toContainText('Same serial number');
  await dialog.getByRole('button', { name: 'Use these details' }).click();
  await expect(matches(page).getByText('Exact serial match', { exact: true })).toBeVisible();
});
