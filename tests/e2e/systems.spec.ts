import { test, expect } from '@playwright/test';
test('catalog a custom computer, link parts, edit specs and release installed units', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Computer Builder');
  const email = process.env.PLAYWRIGHT_TEST_EMAIL
    ? process.env.PLAYWRIGHT_TEST_EMAIL.replace('@', '-systems@')
    : `systems-${Date.now()}@example.com`;
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password', { exact: true }).fill('system-browser-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your hardware. Full of potential.' }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Your deck', exact: false }).first().click();
  await page.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await page.getByLabel('Name *', { exact: true }).fill('Builder CPU');
  await page.getByLabel('Category *').fill('CPU');
  await page.getByLabel('Quantity *').fill('2');
  await page.getByRole('button', { name: 'Add hardware', exact: true }).last().click();
  await expect(page.getByRole('heading', { name: 'Builder CPU' })).toBeVisible();
  await page.getByRole('link', { name: 'Computers', exact: true }).click();
  await page
    .locator('.heading-actions')
    .getByRole('button', { name: 'Add computer', exact: true })
    .click();
  await page.getByLabel('Name *', { exact: true }).fill('My custom desktop');
  await page.getByLabel('Build origin').selectOption('Custom build');
  await page.getByLabel('Processor', { exact: true }).fill('Ryzen 7 7800X3D');
  await page.getByLabel('Graphics', { exact: true }).fill('RTX 4070');
  await page.getByLabel('Memory (GB)').fill('32');
  await page.getByLabel('Storage', { exact: true }).fill('2 TB NVMe SSD');
  await page.getByLabel('Operating system').fill('Windows 11');
  await page.getByLabel('Current value of computer ($)').fill('1500');
  await page.getByRole('button', { name: 'Add computer', exact: true }).last().click();
  const dialog = page.getByRole('dialog');
  await expect(
    dialog.getByRole('heading', { name: 'My custom desktop', exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText('Ryzen 7 7800X3D', { exact: true })).toBeVisible();
  await page.getByLabel('Part to install').selectOption({ label: 'Builder CPU (2 available)' });
  await page.getByRole('button', { name: 'Link part', exact: true }).click();
  await expect(dialog.getByRole('link', { name: 'Builder CPU', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Edit computer', exact: true }).click();
  await page.getByLabel('Memory (GB)').fill('64');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(dialog.getByText('64 GB', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('dialog').getByText('64 GB', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Search computers').fill('7800X3D');
  await page
    .locator('.systems-toolbar')
    .getByRole('button', { name: 'Search', exact: true })
    .click();
  await expect(page.getByRole('heading', { name: 'My custom desktop', exact: true })).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath('computers-desktop.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
    true,
  );
  await page.screenshot({
    path: testInfo.outputPath('computers-mobile.png'),
    fullPage: true,
    animations: 'disabled',
  });
  await page.getByRole('button', { name: /My custom desktop/ }).click();
  await page.getByRole('button', { name: 'Remove part', exact: true }).click();
  await expect(page.getByText('No individual parts linked.', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog' }).click();
  await page.goto('/deck?category=CPU');
  await expect(page.getByText('2 available', { exact: true })).toBeVisible();
});
