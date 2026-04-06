import { test, expect } from '@playwright/test';

test.describe('admin route protection', () => {
  test('guest cannot access admin page', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/auth/);
  });
});