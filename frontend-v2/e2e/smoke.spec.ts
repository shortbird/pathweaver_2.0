import { test, expect } from '@playwright/test';
import { BASE_URL, USERS, clickByText, loginAsStudent, loginAsParent, loginAsSuperadmin, login } from './helpers';

test.describe('Smoke Suite', () => {
  test('S1: Student login -> dashboard loads', async ({ page }) => {
    await loginAsStudent(page);
    await expect(page.getByText('Total XP')).toBeVisible();
    await expect(page.getByText('Active Quests')).toBeVisible();
  });

  test('S2: Parent login -> family view loads', async ({ page }) => {
    await loginAsParent(page);
    await expect(page.getByText(/family|dependents|children/i)).toBeVisible({ timeout: 15000 });
  });

  test('S3: Superadmin login -> admin panel accessible', async ({ page }) => {
    await loginAsSuperadmin(page);
    await clickByText(page, 'Admin');
    await page.waitForTimeout(2000);
    await expect(page.getByText(/admin|users|manage/i)).toBeVisible({ timeout: 15000 });
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
    await clickByText(page, 'Quests');
    await page.waitForTimeout(2000);
    await expect(page.getByText(/quest|project/i)).toBeVisible({ timeout: 15000 });
  });

  test('S7: Student can navigate to journal', async ({ page }) => {
    await loginAsStudent(page);
    await clickByText(page, 'Journal');
    await page.waitForTimeout(2000);
    await expect(page.getByText(/journal|learning/i)).toBeVisible({ timeout: 15000 });
  });

  test('S8: Student can navigate to profile', async ({ page }) => {
    await loginAsStudent(page);
    await clickByText(page, 'Profile');
    await page.waitForTimeout(2000);
    await expect(page.getByText(/profile|settings/i)).toBeVisible({ timeout: 15000 });
  });
});
