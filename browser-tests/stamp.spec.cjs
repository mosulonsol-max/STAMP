const { test, expect } = require('@playwright/test');
const HOST = 'http://127.0.0.1:10000';

test('login, archived market display, authenticated API and logout', async ({ page }) => {
  await page.goto(HOST + '/');
  await expect(page.locator('form[action="/login"]')).toBeVisible();
  await page.locator('#user').fill('test-user');
  await page.locator('#password').fill('long-test-password');
  await page.locator('form[action="/login"] button[type="submit"]').click();
  await expect(page.locator('#price')).not.toHaveText('—', { timeout: 20000 });
  await expect(page.locator('#status')).not.toHaveText('ERROR');
  await expect(page.locator('#sourceLine')).not.toHaveText('—');
  await expect(page.locator('#forecasts')).toContainText('1H');
  await expect(page.locator('#forecastHistory')).toBeVisible();
  const api = await page.request.get(HOST + '/api/dashboard');
  expect(api.status()).toBe(200);
  const result = await api.json();
  expect(result.market.price).toBeGreaterThan(0);
  await page.locator('#settingsButton').click();
  await expect(page.locator('#settings')).toBeVisible();
  await page.locator('#diagnose').click();
  await expect(page.locator('#diagnosticResult')).toContainText('API:', { timeout: 15000 });
  await page.locator('#logoutButton').click();
  await expect(page.locator('form[action="/login"]')).toBeVisible();
});

test('private API cannot be read without authentication', async ({ request }) => {
  const response = await request.get(HOST + '/api/dashboard');
  expect(response.status()).toBe(401);
});
