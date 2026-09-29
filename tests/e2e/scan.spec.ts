import { test, expect, type Page } from '@playwright/test';
const item = {
  name: 'WD hard drive',
  category: 'HDD',
  manufacturer: 'WD',
  model: 'WD40EFRX',
  serialNumber: 'PHOTO-001',
  quantity: 1,
  notes: '4 TB label visible.',
  evidence: 'WD logo and model label are readable.',
  confidence: 'high',
  valuation: {
    estimatedValueCents: 3500,
    lowEstimateCents: 2000,
    highEstimateCents: 4500,
    confidence: 'low',
    currency: 'USD',
    explanation: 'Untested used drive; no live sales data.',
  },
};
const photo = {
  name: 'hardware.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
    'base64',
  ),
};
async function register(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Photo Builder');
  await page
    .getByLabel('Email address')
    .fill(`scan-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('photo-browser-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your hardware. Full of potential.' }),
  ).toBeVisible();
}
test('upload, retry, review and correct identified hardware before saving', async ({
  page,
}, testInfo) => {
  let scans = 0;
  await page.route('**/api/hardware/scan', async (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true } });
    expect(route.request().postDataJSON().image).toMatch(/^data:image\/jpeg;base64,/);
    scans++;
    return scans === 1
      ? route.fulfill({ status: 502, json: { error: 'Try a clearer photo.' } })
      : route.fulfill({ json: { items: [item], message: 'Review the label details.' } });
  });
  await register(page);
  await page.getByRole('button', { name: 'Add hardware', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Location', { exact: true }).selectOption('');
  await dialog.getByLabel('Current value per unit ($)').fill('40');
  await dialog.getByLabel('Upload hardware photo').setInputFiles(photo);
  await expect(dialog.getByRole('img', { name: 'Hardware photo to scan' })).toBeVisible();
  expect(scans).toBe(0);
  await dialog.getByRole('button', { name: 'Scan photo', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Try a clearer photo.');
  await dialog.getByRole('button', { name: 'Scan photo', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'WD hard drive', exact: true })).toBeVisible();
  await expect(dialog.getByLabel('Name *', { exact: true })).toBeEmpty();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('hardware-scan-mobile.png') });
  await dialog.getByRole('button', { name: 'Use these details' }).click();
  await expect(dialog.getByLabel('Name *', { exact: true })).toHaveValue('WD hard drive');
  await expect(dialog.getByLabel('Current value per unit ($)')).toHaveValue('40');
  await expect(dialog.getByLabel('Serial number')).toHaveValue('PHOTO-001');
  await dialog.getByLabel('Name *', { exact: true }).fill('Reviewed archive drive');
  await dialog.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto('/deck');
  await expect(page.getByRole('heading', { name: 'Reviewed archive drive' })).toBeVisible();
  const inventory = await page.request.get('/api/inventory');
  const saved = (await inventory.json()).items.find(
    (i: { name: string }) => i.name === 'Reviewed archive drive',
  );
  expect(saved.estimatedValueCents).toBe(4000);
  expect(saved.aiValuation.estimatedValueCents).toBe(3500);
  expect(saved.manualValueOverrideCents).toBe(4000);
});
test('camera input adds identified parts to the same computer', async ({ page }) => {
  await page.route('**/api/hardware/scan', (route) =>
    route.fulfill({
      json:
        route.request().method() === 'GET'
          ? { enabled: true }
          : {
              items: [
                item,
                {
                  ...item,
                  name: 'Memory stick',
                  category: 'RAM',
                  model: '',
                  serialNumber: '',
                  quantity: 2,
                },
              ],
              message: '',
            },
    }),
  );
  await register(page);
  await page.goto('/systems?add=1');
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name *', { exact: true }).fill('Photo workstation');
  await expect(dialog.getByLabel('Take hardware photo')).toHaveAttribute('capture', 'environment');
  await dialog.getByLabel('Take hardware photo').setInputFiles(photo);
  await dialog.getByRole('button', { name: 'Scan photo', exact: true }).click();
  await dialog
    .getByRole('button', { name: 'Add installed component', exact: true })
    .first()
    .click();
  await dialog.getByRole('button', { name: 'Add installed component', exact: true }).click();
  await expect(dialog.getByLabel('Name *', { exact: true })).toHaveValue('Photo workstation');
  await expect(dialog.getByLabel('Component 1 name')).toHaveValue('WD hard drive');
  await expect(dialog.getByLabel('Component 2 name')).toHaveValue('Memory stick');
  await expect(dialog.getByLabel('Component 3 name')).toBeEmpty();
  await dialog.getByRole('button', { name: 'Add computer', exact: true }).click();
  await expect(dialog.getByRole('link', { name: 'WD hard drive', exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Memory stick', exact: true })).toBeVisible();
  await expect(dialog.getByText('3 UNITS', { exact: true })).toBeVisible();
});
