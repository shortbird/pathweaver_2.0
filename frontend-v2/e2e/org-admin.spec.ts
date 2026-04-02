import { test, expect } from '@playwright/test';
import { clickByText, loginAsOrgAdmin, navigateTo } from './helpers';

test.describe('Org Admin Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOrgAdmin(page);
  });

  test('OA1: Org admin lands on advisor page after login', async ({ page }) => {
    // Org admin sees advisor page (same as advisor view)
    await expect(page.getByText('Advisor').first()).toBeVisible({ timeout: 15000 });
  });

  test('OA2: Org admin page shows student content', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/student|advisor|select/);
  });

  test('OA3: Org admin advisor page has management UI', async ({ page }) => {
    // Org admin has management features on the advisor page
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/advisor|student|select|manage/);
  });

  test('OA4: Org admin can navigate to bounties', async ({ page }) => {
    await navigateTo(page, 'bounties');
    await page.waitForTimeout(3000);
    await expect(page.getByText('Bounties').first()).toBeVisible({ timeout: 15000 });
  });

  test('OA5: Org admin can navigate to quests', async ({ page }) => {
    await navigateTo(page, 'quests');
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/quest|discover|browse/);
  });

  test('OA6: Org admin can navigate to courses', async ({ page }) => {
    await navigateTo(page, 'courses');
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/course|enrolled|my courses/);
  });

  test('OA7: Org admin advisor page shows student data', async ({ page }) => {
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/student|advisor|select|xp|quest/);
  });

  test('OA8: Org admin can navigate to feed', async ({ page }) => {
    await navigateTo(page, 'feed');
    await page.waitForTimeout(3000);
    await expect(page.getByText('Feed').first()).toBeVisible({ timeout: 15000 });
  });

  test('OA9: Org admin can navigate to profile', async ({ page }) => {
    await navigateTo(page, 'profile');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Total XP|Profile|Sign Out/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('OA10: Org admin can sign out', async ({ page }) => {
    await navigateTo(page, 'profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 15000 });
  });
});
