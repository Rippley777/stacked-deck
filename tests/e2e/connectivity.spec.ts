import { test, expect, type Page } from '@playwright/test';
async function register(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Create an account' }).click();
  await page.getByLabel('Your name').fill('Cable Keeper');
  await page.getByLabel('Email address').fill(`cables-${Date.now()}-${Math.random()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('cable-browser-password-123');
  await page.getByRole('button', { name: 'Create your account' }).click();
  await expect(
    page.getByRole('heading', { name: 'Your hardware. Full of potential.' }),
  ).toBeVisible();
}
const power = {
  connector: { connector: 'DC barrel', outerMm: 5.5, innerMm: 2.1 },
  voltage: 12,
  current: 1,
  acDc: 'DC',
  polarity: 'center_positive',
  proprietaryProtocol: 'none',
};
const base = { category: 'Router', quantity: 1, condition: 'Good', status: 'Available' };
const headers = { 'X-Stacked-Deck': '1' };
test('describe a charger, find it from a device, check it and follow reverse matches with locations', async ({
  page,
}, info) => {
  await register(page);
  const location = await (
    await page.request.post('/api/locations', { headers, data: { name: 'Office → Drawer 2' } })
  ).json();
  const router = await (
    await page.request.post('/api/inventory', {
      headers,
      data: { ...base, name: 'Office router', connectivity: { version: 1, verified: true, power } },
    })
  ).json();
  await page.goto('/deck');
  await page.getByRole('button', { name: 'Add hardware', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name *', { exact: true }).fill('Spare 12V supply');
  await dialog.getByLabel('Category *').fill('Power Adapter');
  await dialog.getByLabel('Location', { exact: true }).selectOption(location.id);
  await dialog.getByText('Cables, power & connections', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Describe a charger' }).click();
  await dialog.getByLabel('Connector', { exact: true }).selectOption('DC barrel');
  await dialog.getByLabel('Barrel outer diameter (mm)').fill('5.5');
  await dialog.getByLabel('Barrel inner diameter (mm)').fill('2.1');
  await dialog.getByLabel('Voltage (V)', { exact: true }).fill('12');
  await dialog.getByLabel('Current (A)', { exact: true }).fill('2');
  await dialog.getByLabel('AC or DC', { exact: true }).selectOption('DC');
  await dialog.getByLabel('Polarity', { exact: true }).selectOption('center_positive');
  await dialog.getByLabel('Proprietary protocol').fill('none');
  await dialog.getByLabel('Output mode').selectOption('fixed');
  await dialog.getByLabel('I checked these specifications').check();
  await dialog.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(`/deck?item=${router.id}`);
  await dialog.getByRole('button', { name: 'What do I need?' }).click();
  await expect(dialog.getByRole('link', { name: 'Spare 12V supply' })).toBeVisible();
  await expect(dialog.getByText('✓ Compatible', { exact: true })).toBeVisible();
  await expect(dialog.getByText(/Office → Drawer 2 · 1 owned/)).toBeVisible();
  await dialog
    .getByLabel('Compare a specific charger')
    .selectOption({ label: 'Spare 12V supply · Office → Drawer 2' });
  await dialog.getByRole('button', { name: 'Will this power my device?' }).click();
  await expect(dialog.getByText('✓ Compatible', { exact: true })).toHaveCount(2);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: info.outputPath('cable-assistant-mobile.png') });
  await dialog.getByRole('link', { name: 'Spare 12V supply' }).click();
  await dialog.getByRole('button', { name: 'What uses this?' }).click();
  await expect(dialog.getByRole('link', { name: 'Office router' })).toBeVisible();
  await page.reload();
  await expect(dialog.getByText('Power adapter output', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Search inventory').fill('Show me 12V power adapters');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Spare 12V supply' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Office router' })).toHaveCount(0);
});

test('mystery charger combines photos, checks duplicates and saves only reviewed specifications', async ({
  page,
}) => {
  const photo = {
    name: 'label.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=',
      'base64',
    ),
  };
  const adapter = { ...power, current: 2, outputMode: 'fixed' };
  const suggestion = {
    name: 'Mystery supply',
    category: 'Power Adapter',
    manufacturer: '',
    model: '',
    serialNumber: '',
    quantity: 1,
    notes: '',
    confidence: 'medium',
    evidence: '12V / 2A label readable',
    connectivity: { version: 1, verified: false, adapter },
    candidates: ['DC barrel'],
    likelyUses: ['Routers'],
  };
  await page.route('**/api/hardware/scan', (route) => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { enabled: true } });
    expect(route.request().postDataJSON().images).toHaveLength(2);
    expect(route.request().postDataJSON().mode).toBe('charger');
    return route.fulfill({
      json: { items: [suggestion], message: 'Verify the connector dimensions.' },
    });
  });
  await register(page);
  await page.request.post('/api/inventory', {
    headers,
    data: { ...base, name: 'Router', connectivity: { version: 1, verified: true, power } },
  });
  await page.request.post('/api/inventory', {
    headers,
    data: {
      ...base,
      name: 'Existing supply',
      category: 'Power Adapter',
      quantity: 3,
      connectivity: { version: 1, verified: true, adapter },
    },
  });
  await page.getByRole('button', { name: 'Add hardware', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Scan mode').selectOption('charger');
  await dialog
    .getByLabel('Upload hardware photo')
    .setInputFiles([photo, { ...photo, name: 'connector.png' }]);
  await dialog.getByRole('button', { name: 'Scan photos together' }).click();
  await expect(dialog.getByText('You may already own 3 of these.')).toBeVisible();
  await dialog.getByRole('button', { name: 'Find compatible equipment I own' }).click();
  await expect(dialog.getByText('? Compatibility uncertain', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Use these details' }).click();
  await expect(dialog.getByLabel('Voltage (V)', { exact: true })).toHaveValue('12');
  await expect(dialog.getByLabel('I checked these specifications')).not.toBeChecked();
  await dialog.getByLabel('Barrel inner diameter (mm)').fill('2.5');
  await dialog.getByLabel('I checked these specifications').check();
  await dialog.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  const inventory = await (await page.request.get('/api/inventory')).json();
  expect(
    inventory.items.find((i: { name: string }) => i.name === 'Mystery supply').connectivity,
  ).toMatchObject({ verified: true, adapter: { voltage: 12, connector: { innerMm: 2.5 } } });
});

test('catalog a video cable and distinguish verified performance from an unknown HDMI cable', async ({
  page,
}) => {
  await register(page);
  const monitor = await (
    await page.request.post('/api/inventory', {
      headers,
      data: {
        ...base,
        name: '4K monitor',
        category: 'Monitor',
        connectivity: {
          version: 1,
          verified: true,
          connections: [
            {
              label: '4K 120Hz video',
              purpose: 'video',
              port: { connector: 'HDMI', gender: 'female' },
              role: 'input',
              maxDataGbps: 48,
              videoModes: [{ width: 3840, height: 2160, hz: 120 }],
            },
          ],
        },
      },
    })
  ).json();
  await page.request.post('/api/inventory', {
    headers,
    data: {
      ...base,
      name: 'Generic HDMI cable',
      category: 'Cable',
      connectivity: {
        version: 1,
        verified: true,
        cable: {
          family: 'video',
          a: { connector: 'HDMI', gender: 'male' },
          b: { connector: 'HDMI', gender: 'male' },
          directional: false,
        },
      },
    },
  });
  await page.getByRole('button', { name: 'Add hardware', exact: true }).first().click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name *', { exact: true }).fill('Verified HDMI cable');
  await dialog.getByLabel('Category *').fill('Cable');
  await dialog.getByText('Cables, power & connections', { exact: true }).click();
  await dialog.getByRole('button', { name: 'Describe a cable' }).click();
  await dialog.getByLabel('Cable family').selectOption('video');
  for (const end of ['Connector A', 'Connector B']) {
    const group = dialog.getByRole('group', { name: end, exact: true });
    await group.getByLabel('Connector', { exact: true }).selectOption('HDMI');
    await group.getByLabel('Connector gender').selectOption('male');
  }
  await dialog.getByLabel('Directional (A → B only)').selectOption('false');
  await dialog.getByLabel('Supports video').selectOption('true');
  await dialog.getByLabel('Data rate (Gbps)').fill('48');
  await dialog.getByRole('button', { name: 'Add video modes', exact: true }).click();
  await dialog.getByLabel('Width (pixels)').fill('3840');
  await dialog.getByLabel('Height (pixels)').fill('2160');
  await dialog.getByLabel('Refresh rate (Hz)').fill('120');
  await dialog.getByLabel('I checked these specifications').check();
  await dialog.getByRole('button', { name: 'Add hardware', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.goto(`/deck?item=${monitor.id}`);
  await dialog.getByRole('button', { name: 'What do I need?' }).click();
  await expect(dialog.getByText('✓ Compatible', { exact: true })).toBeVisible();
  await expect(dialog.getByText('? Compatibility uncertain', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Close dialog' }).click();
  await page.getByLabel('Search inventory').fill('Show me cables that can run 4K 120Hz');
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(
    page.getByRole('heading', { name: 'Verified HDMI cable', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Generic HDMI cable', exact: true })).toHaveCount(
    0,
  );
});
