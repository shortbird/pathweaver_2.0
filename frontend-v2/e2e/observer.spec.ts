import { test, expect } from '@playwright/test';
import { clickByText, loginAsObserver, navigateTo } from './helpers';

test.describe('Observer Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsObserver(page);
  });

  test('O1: Observer lands on feed page after login', async ({ page }) => {
    // Observer redirects to Feed page, may see "Welcome to Optio!" modal first time
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/feed|welcome to optio|activity/);
  });

  test('O2: Observer feed page loads', async ({ page }) => {
    await page.waitForTimeout(5000);
    // Dismiss welcome modal if present
    const welcomeModal = page.getByText(/Welcome to Optio/i).first();
    if (await welcomeModal.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Try to dismiss modal
      const dismissBtn = page.getByText(/Got it|Close|OK|Continue/i).first();
      if (await dismissBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await clickByText(page, await dismissBtn.textContent() || 'Got it');
        await page.waitForTimeout(2000);
      }
    }
    await expect(page.getByText('Feed').first()).toBeVisible({ timeout: 15000 });
  });

  test.skip('O3: Can view student portfolio (requires seeded data)', async ({ page }) => {
    // Skipped: requires linked students
  });

  test.skip('O4: Can view student quest history (requires seeded data)', async ({ page }) => {
    // Skipped: requires linked students with quest data
  });

  test.skip('O5: Can view student XP breakdown (requires seeded data)', async ({ page }) => {
    // Skipped: requires linked students with XP data
  });

  test.skip('O6: Can comment on student work (requires seeded data)', async ({ page }) => {
    // Skipped: requires linked students with work to comment on
  });

  test('O7: Observer can navigate to profile', async ({ page }) => {
    await navigateTo(page, 'profile');
    await expect(page.getByText(/Total XP|Profile|Sign Out/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('O8: Observer can sign out', async ({ page }) => {
    await navigateTo(page, 'profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 15000 });
  });
});
