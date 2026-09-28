import { test, expect } from '@playwright/test';

test('create a computer with multiple installed components and remove an unfinished entry', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Component Builder');
  await page.getByLabel('Email address').fill(`components-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('component-test-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await page.getByRole('link', { name: 'Computers', exact: true }).click();
  await page
    .locator('.heading-actions')
    .getByRole('button', { name: 'Add computer', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name *', { exact: true }).fill('Storage workstation');
  await expect(dialog.getByLabel('Component 2 name')).toHaveCount(0);
  await dialog.getByLabel('Component 1 name').pressSequentially('Archive hard drive');
  await expect(dialog.getByLabel('Component 1 name')).toHaveValue('Archive hard drive');
  const hdd = dialog.getByRole('region', { name: 'Component 1', exact: true });
  await hdd.getByLabel('Category *').fill('HDD');
  await hdd.getByLabel('Serial number').fill('HDD-001');
  await dialog.getByLabel('Component 2 name').fill('Temporary RAM');
  await dialog.getByLabel('Component 3 name').fill('Spare SSD');
  const ssd = dialog.getByRole('region', { name: 'Component 3', exact: true });
  await ssd.getByLabel('Category *').fill('SSD');
  await ssd.getByLabel('Quantity installed *').fill('2');
  await ssd.getByLabel('Serial number').fill('SSD-002');
  await ssd.getByLabel('Current value per unit ($)').fill('49.99');
  await dialog.getByRole('button', { name: 'Remove component 2', exact: true }).click();
  await expect(dialog.getByLabel('Component 2 name')).toHaveValue('Spare SSD');
  await expect(dialog.getByLabel('Component 3 name')).toBeEmpty();
  await dialog.getByLabel('Component 3 name').fill('   ');
  await expect(dialog.getByLabel('Component 4 name')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('components-mobile.png') });

  let rejected = false;
  await page.route('**/api/inventory/systems', async (route) => {
    if (!rejected) {
      rejected = true;
      await route.fulfill({ status: 503, json: { error: 'Please retry.' } });
    } else await route.continue();
  });
  await dialog.getByRole('button', { name: 'Add computer', exact: true }).click();
  await expect(dialog.getByRole('alert')).toContainText('Please retry.');
  await expect(dialog.getByLabel('Component 2 name')).toHaveValue('Spare SSD');
  await dialog.getByRole('button', { name: 'Add computer', exact: true }).click();
  await expect(
    dialog.getByRole('heading', { name: 'Storage workstation', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Archive hard drive', exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Spare SSD', exact: true })).toBeVisible();
  await expect(dialog.getByText('3 UNITS', { exact: true })).toBeVisible();
  await page.reload();
  await expect(dialog.getByRole('link', { name: 'Spare SSD', exact: true })).toBeVisible();
  await dialog.getByRole('link', { name: 'Spare SSD', exact: true }).click();
  await expect(dialog.getByText('SSD-002', { exact: true })).toBeVisible();
  await expect(dialog.getByText('$49.99', { exact: true })).toBeVisible();
  await expect(dialog.getByText('2 total · 0 available', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('link', { name: /Storage workstation/ })).toBeVisible();
});
