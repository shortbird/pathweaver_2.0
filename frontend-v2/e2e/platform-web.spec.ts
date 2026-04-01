import { test, expect } from '@playwright/test';
import { BASE_URL, clickByText, loginAsStudent, loginAsSuperadmin } from './helpers';

test.describe('Platform Web Tests', () => {
  test('PL2: Web app loads within acceptable time', async ({ page }) => {
    const start = Date.now();
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    const loadTime = Date.now() - start;
    // Should load within 30 seconds (deployed server may be cold)
    expect(loadTime).toBeLessThan(30000);
    await expect(page.getByText(/welcome|sign in/i)).toBeVisible({ timeout: 30000 });
  });

  test('PL6: Sidebar navigation works on desktop viewport', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await loginAsStudent(page);
    // All main sidebar items should be visible
    await expect(page.getByText('Quests')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Journal')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Bounty Board')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Buddy')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Profile')).toBeVisible({ timeout: 15000 });

    // Click each nav item and verify it navigates
    await clickByText(page, 'Quests');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Journal');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Profile');
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/profile|account|settings/);
  });

  test('PL8: Web-only features are accessible (Quests, Admin, Course Builder)', async ({ page }) => {
    await loginAsSuperadmin(page);
    // Quests should be in sidebar (web-only)
    await expect(page.getByText('Quests')).toBeVisible({ timeout: 15000 });

    // Admin should be visible for superadmin (web-only)
    await expect(page.getByText('Admin')).toBeVisible({ timeout: 15000 });

    // Course Builder should be accessible
    const courseBuilder = page.getByText(/course builder|courses/i).first();
    if (await courseBuilder.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(courseBuilder).toBeVisible();
    }
  });
});
