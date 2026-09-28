import { test, expect } from '@playwright/test';
test('add hardware → organize → choose project → check and reserve', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Browser Builder');
  await page
    .getByLabel('Email address')
    .fill(process.env.PLAYWRIGHT_TEST_EMAIL || `builder-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('browser-test-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your hardware. Full of potential.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Locations', exact: true }).click();
  await page.getByRole('button', { name: 'Add location', exact: true }).click();
  await page.getByLabel('Location name').fill('Office → Bin 3');
  await page.getByRole('button', { name: 'Save location' }).click();
  await expect(page.getByRole('heading', { name: 'Office → Bin 3' })).toBeVisible();
  await page.getByRole('link', { name: 'Your deck', exact: false }).first().click();
  await page.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await page.getByLabel('Name *', { exact: true }).fill('Browser Raspberry Pi');
  await page.getByLabel('Quantity *').fill('3');
  await page.getByLabel('Location', { exact: true }).selectOption({ label: 'Office → Bin 3' });
  await page.getByLabel('Current value per unit').fill('65');
  await page.getByRole('button', { name: 'Add hardware', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Browser Raspberry Pi' })).toBeVisible();
  await page.getByRole('link', { name: 'What can I build?', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'What can I build?' })).toBeVisible();
  await page
    .locator('.recommendation-card')
    .filter({ has: page.getByRole('heading', { name: 'Pi-hole', exact: true }) })
    .getByRole('button', { name: 'Explore build' })
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Browser Raspberry Pi ×1')).toBeVisible();
  await expect(
    page
      .getByRole('dialog')
      .getByText(/Missing 1 · about/)
      .first(),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Make this a project' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page
    .getByLabel('Hardware to assign')
    .selectOption({ label: 'Browser Raspberry Pi (3 available)' });
  await page.getByLabel('Quantity to assign').fill('1');
  await page.getByRole('button', { name: 'Assign', exact: true }).click();
  await expect(page.getByText('×1 · Reserved')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByRole('link', { name: 'Your deck', exact: false }).first().click();
  await expect(page.getByText('2 available')).toBeVisible();
  await page.reload();
  await expect(page.getByText('2 available')).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Your deck', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByRole('heading', { name: 'Welcome back.' })).toBeVisible();
});
