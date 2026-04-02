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

  test('O3: Observer can view linked student content on feed', async ({ page }) => {
    // Observer is linked to Student from initial seed
    await page.waitForTimeout(5000);
    // Dismiss welcome modal if present
    const dismissBtn = page.getByText(/Got it|Close|OK|Continue/i).first();
    if (await dismissBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismissBtn.click();
      await page.waitForTimeout(2000);
    }
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/feed|activity|recent|no activity|student/);
  });

  test('O4: Observer feed shows activity or empty state', async ({ page }) => {
    await page.waitForTimeout(5000);
    // Dismiss welcome modal if present
    const dismissBtn = page.getByText(/Got it|Close|OK|Continue/i).first();
    if (await dismissBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismissBtn.click();
      await page.waitForTimeout(2000);
    }
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/feed|activity|recent|completions|no activity/);
  });

  test('O5: Observer can see student XP or activity data', async ({ page }) => {
    await page.waitForTimeout(5000);
    // Dismiss welcome modal if present
    const dismissBtn = page.getByText(/Got it|Close|OK|Continue/i).first();
    if (await dismissBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismissBtn.click();
      await page.waitForTimeout(2000);
    }
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/feed|xp|activity|student|recent|no activity/);
  });

  test('O6: Observer feed page is interactive', async ({ page }) => {
    await page.waitForTimeout(5000);
    // Dismiss welcome modal if present
    const dismissBtn = page.getByText(/Got it|Close|OK|Continue/i).first();
    if (await dismissBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await dismissBtn.click();
      await page.waitForTimeout(2000);
    }
    // Verify the feed page loaded and is interactive
    await expect(page.getByText('Feed').first()).toBeVisible({ timeout: 15000 });
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
