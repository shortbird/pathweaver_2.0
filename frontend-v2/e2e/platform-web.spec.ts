import { test, expect } from '@playwright/test';
import { BASE_URL, loginAsStudent, loginAsSuperadmin, navigateTo } from './helpers';

test.describe('Platform Web Tests', () => {
  test('PL2: Web app loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const loadTime = Date.now() - start;
    expect(loadTime).toBeLessThan(30000);
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 30000 });
  });

  test('PL6: Sidebar navigation works on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsStudent(page);
    // Main sidebar items should be visible
    await expect(page.getByText('Home').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Quests').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Journal').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Bounties').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Buddy').first()).toBeVisible({ timeout: 15000 });

    // Navigate using sidebar
    await navigateTo(page, 'quests');
    await page.waitForTimeout(2000);
    await navigateTo(page, 'journal');
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/journal/);
  });

  test('PL8: Web-only features are accessible (Quests, Admin, Course Builder)', async ({ page }) => {
    await loginAsSuperadmin(page);
    // Quests should be in sidebar
    await expect(page.getByText('Quests').first()).toBeVisible({ timeout: 15000 });

    // Admin should be visible for superadmin
    await expect(page.getByText('Admin').first()).toBeVisible({ timeout: 15000 });

    // Courses should be in sidebar
    await expect(page.getByText('Courses').first()).toBeVisible({ timeout: 15000 });
  });
});
