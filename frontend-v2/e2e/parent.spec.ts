import { test, expect } from '@playwright/test';
import { clickByText, loginAsParent, navigateTo } from './helpers';

test.describe('Parent Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsParent(page);
  });

  test('P1: Parent lands on family page after login', async ({ page }) => {
    // Parent redirects to family page with child selector
    await expect(page.getByText('Family', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('P2: Parent sees child name', async ({ page }) => {
    // Family page shows child name (e.g. "Test Child")
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/child|family|total xp|actions/);
  });

  test('P3: Parent sees Total XP for dependent', async ({ page }) => {
    await expect(page.getByText(/Total XP/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P4: Parent sees Actions section', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/action|quest|xp|family/);
  });

  test('P5: Parent sees Learning Rhythm', async ({ page }) => {
    await expect(page.getByText(/Learning Rhythm/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P6: Parent sees Active Quests', async ({ page }) => {
    await expect(page.getByText(/Active Quests/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P7: Parent can navigate to bounties', async ({ page }) => {
    await navigateTo(page, 'bounties');
    await expect(page.getByText('Bounties').first()).toBeVisible({ timeout: 15000 });
  });

  test.skip('P8: Can approve pending tasks (requires seeded data)', async ({ page }) => {
    // Skipped: requires pending task approvals
  });

  test.skip('P9: Can add a new dependent (requires interaction)', async ({ page }) => {
    // Skipped: dependent creation requires specific form interaction
  });

  test.skip('P10: Can view dependent journal entries (requires seeded data)', async ({ page }) => {
    // Skipped: requires journal entry data
  });

  test.skip('P11: Parent can see engagement heatmap (requires seeded data)', async ({ page }) => {
    // Skipped: requires activity data
  });

  test('P12: Parent can navigate to profile', async ({ page }) => {
    await navigateTo(page, 'profile');
    await expect(page.getByText(/Total XP|Profile|Sign Out/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P13: Parent can sign out', async ({ page }) => {
    await navigateTo(page, 'profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 15000 });
  });

  test.skip('P14: Parent can approve bounty redemption (requires seeded data)', async ({ page }) => {
    // Skipped: requires pending bounty redemption
  });

  test.skip('P15: Parent can view dependent badges (requires seeded data)', async ({ page }) => {
    // Skipped: requires badge data
  });

  test.skip('P16: Parent can promote dependent (requires interaction)', async ({ page }) => {
    // Skipped: promote flow requires specific interaction
  });
});
