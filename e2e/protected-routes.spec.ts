import { test, expect } from '@playwright/test';

test.describe('protected routes', () => {
  test('guest redirected from dashboard to auth', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('guest redirected from censoring to auth', async ({ page }) => {
    await page.goto('/censoring');
    await expect(page).toHaveURL(/\/auth/);
  });

  test('guest redirected from admin to auth', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/auth/);
  });
});