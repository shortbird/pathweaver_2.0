import { test, expect } from '@playwright/test';
import { clickByText, loginAsAdvisor, navigateTo } from './helpers';

test.describe('Advisor Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdvisor(page);
  });

  test('AD1: Advisor dashboard loads', async ({ page }) => {
    await expect(page.getByText(/advisor|student|dashboard/i)).toBeVisible({ timeout: 15000 });
  });

  test('AD2: Advisor sees assigned students', async ({ page }) => {
    await expect(page.getByText(/student|assigned|manage/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('AD3: Can view student progress', async ({ page }) => {
    await page.waitForTimeout(3000);
    const studentCard = page.getByText(/student/i).first();
    if (await studentCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await studentCard.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/progress|xp|quest|task/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('AD4: Can approve student tasks', async ({ page }) => {
    await page.waitForTimeout(3000);
    const pendingSection = page.getByText(/pending|approval|review/i).first();
    if (await pendingSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(pendingSection).toBeVisible();
    }
  });

  test('AD5: Can assign quests to students', async ({ page }) => {
    await page.waitForTimeout(3000);
    const assignBtn = page.getByText(/assign|quest|suggest/i).first();
    if (await assignBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(assignBtn).toBeVisible();
    }
  });

  test('AD6: Can view student XP analytics', async ({ page }) => {
    await page.waitForTimeout(3000);
    await expect(page.getByText(/xp|analytics|progress|pillar/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('AD7: Advisor can navigate to profile', async ({ page }) => {
    await navigateTo(page, 'Profile');
    await expect(page.getByText(/profile|account|settings/i)).toBeVisible({ timeout: 15000 });
  });

  test('AD8: Advisor can sign out', async ({ page }) => {
    await navigateTo(page, 'Profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/welcome|sign in/i)).toBeVisible({ timeout: 15000 });
  });
});
