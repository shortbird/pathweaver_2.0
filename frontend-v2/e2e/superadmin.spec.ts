import { test, expect } from '@playwright/test';
import { clickByText, loginAsSuperadmin, navigateTo } from './helpers';

test.describe('Superadmin Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsSuperadmin(page);
  });

  test('SA1: Superadmin dashboard loads', async ({ page }) => {
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 20000 });
  });

  test('SA2: Admin sidebar link is visible', async ({ page }) => {
    await expect(page.getByText('Admin').first()).toBeVisible({ timeout: 15000 });
  });

  test('SA3: Can access admin panel', async ({ page }) => {
    await navigateTo(page, 'admin');
    await expect(page.getByText('Admin Panel').first()).toBeVisible({ timeout: 15000 });
  });

  test('SA4: Admin panel shows Users tab', async ({ page }) => {
    await navigateTo(page, 'admin');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Users/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('SA5: Admin panel shows Organizations tab', async ({ page }) => {
    await navigateTo(page, 'admin');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Organizations/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('SA6: Admin panel shows Quests tab', async ({ page }) => {
    await navigateTo(page, 'admin');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Quests/i).first()).toBeVisible({ timeout: 15000 });
  });

  test.skip('SA7: Can view all quests detail (requires interaction)', async ({ page }) => {
    // Skipped: requires clicking into quest tab and viewing data
  });

  test('SA8: Superadmin sees Courses in sidebar', async ({ page }) => {
    await expect(page.getByText('Courses').first()).toBeVisible({ timeout: 15000 });
  });

  test.skip('SA9: Can edit user roles (requires seeded data)', async ({ page }) => {
    // Skipped: requires clicking into user details
  });

  test.skip('SA10: Can view platform-wide XP stats (requires seeded data)', async ({ page }) => {
    // Skipped: requires analytics data
  });

  test('SA11: Superadmin can navigate to own profile', async ({ page }) => {
    await navigateTo(page, 'profile');
    await expect(page.getByText(/Total XP|Profile|Sign Out/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('SA12: Superadmin can sign out', async ({ page }) => {
    // Sign Out is in the sidebar - scroll to it if needed
    const signOut = page.locator('text="Sign Out"').first();
    await signOut.scrollIntoViewIfNeeded();
    await signOut.click();
    await page.waitForTimeout(3000);
    await expect(page.getByText('Welcome Back')).toBeVisible({ timeout: 15000 });
  });
});
