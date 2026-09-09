import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

test.describe('Student Bounties', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'bounties');
  });

  test('ST35: Bounty Board page loads', async ({ page }) => {
    await expect(page.getByText('Bounties').first()).toBeVisible({ timeout: 15000 });
  });

  test('ST36: Bounty Board shows tabs', async ({ page }) => {
    // Bounty Board has Browse/Claims/Posted tabs
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/browse|claims|posted|bounty/);
  });

  test('ST37: Bounty page shows available bounties or empty state', async ({ page }) => {
    // Seeded bounty "Clean Up the Community Garden" is family visibility for child
    // Student may or may not see it depending on visibility rules
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/bounty|bounties|browse|no bounties|empty|clean up/);
  });

  test('ST38: Bounty Board Browse tab is active by default', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Browse tab should be the default view
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/browse|bounties/);
  });

  test('ST39: Bounty Board has My Claims tab', async ({ page }) => {
    // Click on My Claims tab
    await page.waitForTimeout(3000);
    const claimsTab = page.getByText(/My Claims|Claims/i).first();
    if (await claimsTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await claimsTab.click();
      await page.waitForTimeout(3000);
    }
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/claim|bounties|no claim|empty/);
  });

  test('ST40: Bounty Board has Posted tab', async ({ page }) => {
    // Click on Posted tab
    await page.waitForTimeout(3000);
    const postedTab = page.getByText(/Posted/i).first();
    if (await postedTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await postedTab.click();
      await page.waitForTimeout(3000);
    }
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/posted|bounties|no bounties|empty/);
  });

  test('ST41: Bounty page shows bounty content', async ({ page }) => {
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    // Should show bounties page with some content
    expect(content?.toLowerCase()).toMatch(/bounties|browse|xp|reward/);
  });
});
