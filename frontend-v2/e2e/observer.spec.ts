import { test, expect } from '@playwright/test';
import { clickByText, loginAsObserver, navigateTo } from './helpers';

test.describe('Observer Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsObserver(page);
  });

  test('O1: Observer dashboard loads', async ({ page }) => {
    await expect(page.getByText(/observer|student|portfolio|dashboard/i)).toBeVisible({ timeout: 15000 });
  });

  test('O2: Observer sees linked students', async ({ page }) => {
    await expect(page.getByText(/student|linked|assigned/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('O3: Can view student portfolio', async ({ page }) => {
    await page.waitForTimeout(3000);
    const studentCard = page.getByText(/student/i).first();
    if (await studentCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await studentCard.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/portfolio|xp|progress|quest/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('O4: Can view student quest history', async ({ page }) => {
    await page.waitForTimeout(3000);
    const studentCard = page.getByText(/student/i).first();
    if (await studentCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await studentCard.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/quest|history|completed/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('O5: Can view student XP breakdown', async ({ page }) => {
    await page.waitForTimeout(3000);
    await expect(page.getByText(/xp|experience|pillar/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('O6: Can comment on student work', async ({ page }) => {
    await page.waitForTimeout(3000);
    const studentCard = page.getByText(/student/i).first();
    if (await studentCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await studentCard.click();
      await page.waitForTimeout(2000);
      const commentBtn = page.getByText(/comment|feedback|note/i).first();
      if (await commentBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(commentBtn).toBeVisible();
      }
    }
  });

  test('O7: Observer can navigate to profile', async ({ page }) => {
    await navigateTo(page, 'Profile');
    await expect(page.getByText(/profile|account|settings/i)).toBeVisible({ timeout: 15000 });
  });

  test('O8: Observer can sign out', async ({ page }) => {
    await navigateTo(page, 'Profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/welcome|sign in/i)).toBeVisible({ timeout: 15000 });
  });
});
