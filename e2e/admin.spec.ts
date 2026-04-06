import { test, expect } from '@playwright/test';

test.describe('auth page', () => {
  test('login page is accessible', async ({ page }) => {
    await page.goto('/auth');
    await expect(page.getByRole('heading', { name: /welcome back|create account/i })).toBeVisible();
  });

  test('can switch between sign in and sign up modes', async ({ page }) => {
    await page.goto('/auth');

    await page.getByRole('button', { name: /sign up/i }).click();
    await expect(page.getByRole('heading', { name: /create account/i })).toBeVisible();

    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByRole('heading', { name: /welcome back/i })).toBeVisible();
  });

  test('shows validation message on mismatched signup passwords', async ({ page }) => {
    await page.goto('/auth');

    await page.getByRole('button', { name: /sign up/i }).click();

    await page.getByLabel(/username/i).fill('alice');
    await page.getByLabel(/email/i).fill('alice@test.com');
    await page.getByLabel(/^password$/i).fill('secret123');
    await page.getByLabel(/confirm password/i).fill('different');
    await page.getByRole('button', { name: /create account/i }).click();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });
});