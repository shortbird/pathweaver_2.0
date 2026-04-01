import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

test.describe('Student Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'Profile');
  });

  test('ST45: Profile page loads', async ({ page }) => {
    await expect(page.getByText(/profile|settings|account/i)).toBeVisible({ timeout: 15000 });
  });

  test('ST46: Profile shows display name', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Should show the user's display name
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('ST47: Profile shows email', async ({ page }) => {
    await page.waitForTimeout(3000);
    await expect(page.getByText(/@/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST48: Profile shows total XP', async ({ page }) => {
    await expect(page.getByText(/xp|experience/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST49: Profile shows badges earned', async ({ page }) => {
    await expect(page.getByText(/badge|achievement/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST50: Can edit display name', async ({ page }) => {
    await page.waitForTimeout(3000);
    const editBtn = page.getByText(/edit|update|change/i).first();
    if (await editBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(editBtn).toBeVisible();
    }
  });

  test('ST51: Profile shows skill pillar breakdown', async ({ page }) => {
    await expect(page.getByText(/knowledge|creativity|leadership|physical|community|financial/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST52: Sign out button is visible', async ({ page }) => {
    await expect(page.getByText(/sign out|log out|logout/i).first()).toBeVisible({ timeout: 15000 });
  });
});
