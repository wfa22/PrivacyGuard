import { test, expect } from '@playwright/test';

test.describe('dashboard scenarios', () => {
  test('protected dashboard redirects guest', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth/);
  });
});