import { test, expect } from '@playwright/test';
const valuation = {
  estimatedValueCents: 37500,
  lowEstimateCents: 32500,
  highEstimateCents: 42500,
  confidence: 'medium',
  currency: 'USD',
  explanation: 'Used hardware estimate without live sales data.',
};
test('review a draft estimate, save it, track manual overrides and recover from AI failures', async ({
  page,
}, testInfo) => {
  let requests = 0;
  await page.route('**/api/hardware/valuation', (route) => {
    requests++;
    return route.fulfill({ json: { valuation, message: '' } });
  });
  await page.route('**/api/inventory/*/valuation', (route) =>
    route.fulfill({
      status: 502,
      json: { error: 'AI service unavailable. Your current value is unchanged.' },
    }),
  );
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Portfolio Owner');
  await page.getByLabel('Email address').fill(`portfolio-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('portfolio-browser-password');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your hardware. Full of potential.' }),
  ).toBeVisible();
  expect(requests).toBe(0);
  await page.getByRole('button', { name: 'Add hardware', exact: true }).first().click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name *', { exact: true }).fill('Portfolio GPU');
  await dialog.getByLabel('Category *').fill('GPU');
  await dialog.getByLabel('Manufacturer', { exact: true }).fill('NVIDIA');
  await dialog.getByLabel('Model', { exact: true }).fill('RTX 3070 Ti');
  await dialog.getByLabel('Purchase price per unit ($)').fill('500');
  await dialog.getByRole('button', { name: 'Estimate value', exact: true }).click();
  await expect(dialog.getByLabel('Initial valuation')).toContainText('$375.00');
  await expect(dialog.getByLabel('Initial valuation')).toContainText('Confidence: medium');
  await dialog.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByLabel('Hardware portfolio')).toContainText('$375.00');
  await expect(page.getByLabel('Hardware portfolio')).toContainText('-25.0%');
  await page.getByRole('button', { name: /Most valuable holding: Portfolio GPU/ }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('Equipment valuation')).toContainText('AI estimate');
  await expect(dialog.getByRole('img', { name: /Value per unit over time/ })).toBeVisible();
  await dialog.getByLabel('Manual value per unit ($)').fill('400');
  await dialog.getByRole('button', { name: 'Save manual value' }).click();
  await expect(dialog.getByLabel('Equipment valuation')).toContainText('Manual override');
  await expect(dialog.getByLabel('Manual value per unit ($)')).toHaveValue('400');
  await dialog.getByRole('button', { name: 'Refresh valuation' }).click();
  await expect(dialog.getByRole('alert')).toContainText('AI service unavailable');
  await expect(dialog.getByLabel('Manual value per unit ($)')).toHaveValue('400');
  await dialog.getByLabel('Manual value per unit ($)').fill('');
  await dialog.getByRole('button', { name: 'Save manual value' }).click();
  await expect(dialog.getByLabel('Equipment valuation')).toContainText('AI estimate');
  await dialog.getByText('Valuation history (3)').click();
  await expect(dialog.getByText('Applied', { exact: false })).toHaveCount(3);
  await expect(dialog.locator('.valuation-history-row').filter({ hasText: '$400.00' })).toHaveCount(
    1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('valuation-mobile.png') });
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.reload();
  await expect(page.getByLabel('Hardware portfolio')).toContainText('$375.00');
  expect(requests).toBe(1);
  const portfolio = page.getByLabel('Hardware portfolio');
  expect(await portfolio.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await portfolio.screenshot({ path: testInfo.outputPath('portfolio-mobile.png') });
  await page.setViewportSize({ width: 1280, height: 900 });
  await portfolio.screenshot({ path: testInfo.outputPath('portfolio-desktop.png') });
});
