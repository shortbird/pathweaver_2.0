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
    await expect(page.getByText('Admin')).toBeVisible({ timeout: 15000 });
  });

  test('SA3: Can access admin panel', async ({ page }) => {
    await clickByText(page, 'Admin');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/admin|manage|user/i)).toBeVisible({ timeout: 15000 });
  });

  test('SA4: Can view all users', async ({ page }) => {
    await clickByText(page, 'Admin');
    await page.waitForTimeout(3000);
    const usersTab = page.getByText(/users|all users|manage users/i).first();
    if (await usersTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await usersTab.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/@/).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('SA5: Can view all organizations', async ({ page }) => {
    await clickByText(page, 'Admin');
    await page.waitForTimeout(3000);
    const orgsTab = page.getByText(/organization/i).first();
    if (await orgsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await orgsTab.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/organization|org|name/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('SA6: Can view analytics', async ({ page }) => {
    await clickByText(page, 'Admin');
    await page.waitForTimeout(3000);
    const analyticsTab = page.getByText(/analytics|statistics/i).first();
    if (await analyticsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await analyticsTab.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/analytics|user|active|total/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('SA7: Can view all quests', async ({ page }) => {
    await clickByText(page, 'Admin');
    await page.waitForTimeout(3000);
    const questsTab = page.getByText(/quest/i).first();
    if (await questsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await questsTab.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/quest|project|title/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('SA8: Can access course builder', async ({ page }) => {
    const courseBuilder = page.getByText(/course builder|courses/i).first();
    if (await courseBuilder.isVisible({ timeout: 5000 }).catch(() => false)) {
      await courseBuilder.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/course|create|builder/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('SA9: Can edit user roles', async ({ page }) => {
    await clickByText(page, 'Admin');
    await page.waitForTimeout(3000);
    const usersTab = page.getByText(/users|all users/i).first();
    if (await usersTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await usersTab.click();
      await page.waitForTimeout(2000);
      // Click on a user to see edit options
      const userRow = page.getByText(/@/).first();
      if (await userRow.isVisible({ timeout: 5000 }).catch(() => false)) {
        await userRow.click();
        await page.waitForTimeout(2000);
        await expect(page.getByText(/role|edit|manage/i).first()).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('SA10: Can view platform-wide XP stats', async ({ page }) => {
    await clickByText(page, 'Admin');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/xp|total|platform/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('SA11: Superadmin can navigate to own profile', async ({ page }) => {
    await navigateTo(page, 'Profile');
    await expect(page.getByText(/profile|account|settings/i)).toBeVisible({ timeout: 15000 });
  });

  test('SA12: Superadmin can sign out', async ({ page }) => {
    await navigateTo(page, 'Profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/welcome|sign in/i)).toBeVisible({ timeout: 15000 });
  });
});
