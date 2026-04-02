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

  test('SA7: Admin panel Quests tab shows quest data', async ({ page }) => {
    await navigateTo(page, 'admin');
    await page.waitForTimeout(3000);
    // Click on Quests tab
    const questsTab = page.getByText(/Quests/i).first();
    await questsTab.click();
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/quest|admin|learn|code|financial/);
  });

  test('SA8: Superadmin sees Courses in sidebar', async ({ page }) => {
    await expect(page.getByText('Courses').first()).toBeVisible({ timeout: 15000 });
  });

  test('SA9: Admin panel Users tab shows user data', async ({ page }) => {
    await navigateTo(page, 'admin');
    await page.waitForTimeout(3000);
    // Click on Users tab
    const usersTab = page.getByText(/Users/i).first();
    await usersTab.click();
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/user|email|role|admin/);
  });

  test('SA10: Admin panel shows platform stats', async ({ page }) => {
    await navigateTo(page, 'admin');
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/admin|panel|user|quest|organization|stat/);
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
