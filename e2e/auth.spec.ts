import { test, expect } from '@playwright/test';

test.describe('auth and session', () => {
  test('login page is accessible', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByRole('heading', { name: /welcome back|create account/i })).toBeVisible();
  });

  test('guest redirected to auth from protected route', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth/);
  });
});