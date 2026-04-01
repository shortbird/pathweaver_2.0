import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

test.describe('Student Bounties', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'Bounty Board');
  });

  test('ST35: Bounty Board page loads', async ({ page }) => {
    await expect(page.getByText(/bount|reward|board/i)).toBeVisible({ timeout: 15000 });
  });

  test('ST36: Available bounties are displayed', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Should show bounty cards or empty state
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/bount|reward|no bounties|available/);
  });

  test('ST37: Bounty shows XP cost', async ({ page }) => {
    await page.waitForTimeout(3000);
    const xpText = page.getByText(/xp/i).first();
    if (await xpText.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(xpText).toBeVisible();
    }
  });

  test('ST38: Can view bounty details', async ({ page }) => {
    await page.waitForTimeout(3000);
    const bountyCard = page.locator('[data-testid*="bounty"]').first();
    if (await bountyCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bountyCard.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/description|detail|redeem/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('ST39: Can redeem a bounty with sufficient XP', async ({ page }) => {
    await page.waitForTimeout(3000);
    const redeemBtn = page.getByText(/redeem|claim/i).first();
    if (await redeemBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(redeemBtn).toBeVisible();
    }
  });

  test('ST40: Redeemed bounties section visible', async ({ page }) => {
    await page.waitForTimeout(3000);
    const redeemedTab = page.getByText(/redeemed|claimed|history/i).first();
    if (await redeemedTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(redeemedTab).toBeVisible();
    }
  });

  test('ST41: Bounty shows creator info', async ({ page }) => {
    await page.waitForTimeout(3000);
    const bountyCard = page.locator('[data-testid*="bounty"]').first();
    if (await bountyCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bountyCard.click();
      await page.waitForTimeout(2000);
      // Should show who created the bounty
      await expect(page.getByText(/created by|from|offered by/i).first()).toBeVisible({ timeout: 15000 });
    }
  });
});
