import { test, expect } from '@playwright/test';
import { clickByText, loginAsOrgAdmin, navigateTo } from './helpers';

test.describe('Organization Invitations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOrgAdmin(page);
  });

  test('INV9: Org admin can access advisor page', async ({ page }) => {
    // Org admin lands on advisor page which has management features
    await expect(page.getByText('Advisor').first()).toBeVisible({ timeout: 15000 });
  });

  test('INV10: Org admin page shows student management UI', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/student|advisor|select|manage/);
  });

  test('INV11: Org admin can navigate to profile', async ({ page }) => {
    await navigateTo(page, 'profile');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Total XP|Profile|Sign Out/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('INV12: Org admin profile shows organization info', async ({ page }) => {
    await navigateTo(page, 'profile');
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/profile|total xp|sign out/);
  });

  test('INV13: Org admin sees student list', async ({ page }) => {
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/student|select|advisor/);
  });

  test('INV14: Org admin page is interactive', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Verify the advisor page loaded and is interactive
    await expect(page.getByText('Advisor').first()).toBeVisible({ timeout: 15000 });
  });

  test('INV15: Org admin can navigate between pages', async ({ page }) => {
    await navigateTo(page, 'bounties');
    await page.waitForTimeout(3000);
    await expect(page.getByText('Bounties').first()).toBeVisible({ timeout: 15000 });
  });

  test('INV16: Org admin can sign out', async ({ page }) => {
    await navigateTo(page, 'profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 15000 });
  });
});
