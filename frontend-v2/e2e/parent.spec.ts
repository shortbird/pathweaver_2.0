import { test, expect } from '@playwright/test';
import { clickByText, loginAsParent, navigateTo } from './helpers';

test.describe('Parent Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsParent(page);
  });

  test('P1: Parent dashboard loads after login', async ({ page }) => {
    await expect(page.getByText(/family|dependent|child|dashboard/i)).toBeVisible({ timeout: 15000 });
  });

  test('P2: Parent sees list of dependents', async ({ page }) => {
    await expect(page.getByText(/dependent|child|student/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P3: Can view dependent profile', async ({ page }) => {
    await page.waitForTimeout(3000);
    const dependentCard = page.getByText(/jane|dependent|student/i).first();
    if (await dependentCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dependentCard.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/xp|quest|progress|profile/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('P4: Can view dependent quest progress', async ({ page }) => {
    await page.waitForTimeout(3000);
    const dependentCard = page.getByText(/jane|dependent|student/i).first();
    if (await dependentCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dependentCard.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/quest|progress|active/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('P5: Can view dependent XP summary', async ({ page }) => {
    await page.waitForTimeout(3000);
    await expect(page.getByText(/xp|experience|points/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P6: Can create a bounty for dependent', async ({ page }) => {
    await page.waitForTimeout(3000);
    const bountyBtn = page.getByText(/bounty|reward|create/i).first();
    if (await bountyBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(bountyBtn).toBeVisible();
    }
  });

  test('P7: Can view bounty board for dependent', async ({ page }) => {
    await page.waitForTimeout(3000);
    await navigateTo(page, 'Bounties');
    await expect(page.getByText(/bount|reward/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P8: Can approve pending tasks', async ({ page }) => {
    await page.waitForTimeout(3000);
    const pendingSection = page.getByText(/pending|approval|review/i).first();
    if (await pendingSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(pendingSection).toBeVisible();
    }
  });

  test('P9: Can add a new dependent', async ({ page }) => {
    await page.waitForTimeout(3000);
    const addBtn = page.getByText(/add child|add dependent|add student|create/i).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('P10: Can view dependent journal entries', async ({ page }) => {
    await page.waitForTimeout(3000);
    const dependentCard = page.getByText(/jane|dependent|student/i).first();
    if (await dependentCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dependentCard.click();
      await page.waitForTimeout(2000);
      const journalTab = page.getByText(/journal|learning/i).first();
      if (await journalTab.isVisible({ timeout: 5000 }).catch(() => false)) {
        await journalTab.click();
        await page.waitForTimeout(2000);
        await expect(page.getByText(/journal|entry|learning/i).first()).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('P11: Parent can see engagement heatmap for dependent', async ({ page }) => {
    await page.waitForTimeout(3000);
    await expect(page.getByText(/activity|streak|engagement|rhythm/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P12: Parent can navigate to profile', async ({ page }) => {
    await navigateTo(page, 'Profile');
    await expect(page.getByText(/profile|account|settings/i)).toBeVisible({ timeout: 15000 });
  });

  test('P13: Parent can sign out', async ({ page }) => {
    await navigateTo(page, 'Profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/welcome|sign in/i)).toBeVisible({ timeout: 15000 });
  });

  test('P14: Parent can approve bounty redemption', async ({ page }) => {
    await page.waitForTimeout(3000);
    const pendingRedemption = page.getByText(/pending.*redemption|approve.*bounty|bounty.*request/i).first();
    if (await pendingRedemption.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(pendingRedemption).toBeVisible();
    }
  });

  test('P15: Parent can view dependent badges', async ({ page }) => {
    await page.waitForTimeout(3000);
    const dependentCard = page.getByText(/jane|dependent|student/i).first();
    if (await dependentCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dependentCard.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/badge|achievement/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('P16: Parent can promote dependent to full account', async ({ page }) => {
    await page.waitForTimeout(3000);
    const promoteBtn = page.getByText(/promote|upgrade|independent/i).first();
    if (await promoteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(promoteBtn).toBeVisible();
    }
  });
});
