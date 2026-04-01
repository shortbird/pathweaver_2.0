import { test, expect } from '@playwright/test';
import { BASE_URL, clickByText, loginAsStudent, loginAsParent, loginAsSuperadmin, navigateTo } from './helpers';

test.describe('Smoke Suite', () => {
  test('S1: Student login -> dashboard loads', async ({ page }) => {
    await loginAsStudent(page);
    await expect(page.getByText('Total XP')).toBeVisible();
    await expect(page.getByText('Active Quests')).toBeVisible();
  });

  test('S2: Parent login -> family view loads', async ({ page }) => {
    await loginAsParent(page);
    await expect(page.getByText('Family', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('S3: Superadmin login -> admin panel accessible', async ({ page }) => {
    await loginAsSuperadmin(page);
    await navigateTo(page, 'admin');
    await expect(page.getByText('Admin Panel')).toBeVisible({ timeout: 15000 });
  });

  test('S4: Invalid credentials -> error message', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill('invalid@test.com');
    await page.getByPlaceholder('Enter password').fill('wrongpassword');
    await clickByText(page, 'Sign In');
    await expect(page.getByText(/invalid|error|incorrect/i)).toBeVisible({ timeout: 15000 });
  });

  test('S5: Unauthenticated user redirected to login', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await expect(page.getByPlaceholder('you@email.com')).toBeVisible();
  });

  test('S6: Student can navigate to quests', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'quests');
    await expect(page.getByText(/Discover|Browse|Quest/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('S7: Student can navigate to journal', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'journal');
    await expect(page.getByText(/Journal|Learning|Moments/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('S8: Student can navigate to profile', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'profile');
    await expect(page.getByText(/Profile|Total XP|Member since/i).first()).toBeVisible({ timeout: 15000 });
  });
});
