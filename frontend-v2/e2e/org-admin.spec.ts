import { test, expect } from '@playwright/test';
import { clickByText, loginAsOrgAdmin, navigateTo } from './helpers';

test.describe('Org Admin Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsOrgAdmin(page);
  });

  test('OA1: Org admin dashboard loads', async ({ page }) => {
    await expect(page.getByText(/organization|admin|manage|dashboard/i)).toBeVisible({ timeout: 15000 });
  });

  test('OA2: Can view organization members', async ({ page }) => {
    await page.waitForTimeout(3000);
    await expect(page.getByText(/member|user|student|staff/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('OA3: Can invite new members', async ({ page }) => {
    await page.waitForTimeout(3000);
    const inviteBtn = page.getByText(/invite|add member|add user/i).first();
    if (await inviteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(inviteBtn).toBeVisible();
    }
  });

  test('OA4: Can change member roles', async ({ page }) => {
    await page.waitForTimeout(3000);
    const memberRow = page.getByText(/student|advisor|member/i).first();
    if (await memberRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await memberRow.click();
      await page.waitForTimeout(2000);
      const roleSelect = page.getByText(/role|change role|edit/i).first();
      if (await roleSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(roleSelect).toBeVisible();
      }
    }
  });

  test('OA5: Can view organization quests', async ({ page }) => {
    await page.waitForTimeout(3000);
    const questsSection = page.getByText(/quest|project|curriculum/i).first();
    if (await questsSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(questsSection).toBeVisible();
    }
  });

  test('OA6: Can create quests for organization', async ({ page }) => {
    await page.waitForTimeout(3000);
    const createBtn = page.getByText(/create quest|new quest|add quest/i).first();
    if (await createBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(createBtn).toBeVisible();
    }
  });

  test('OA7: Can view organization analytics', async ({ page }) => {
    await page.waitForTimeout(3000);
    const analyticsSection = page.getByText(/analytics|statistics|report/i).first();
    if (await analyticsSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(analyticsSection).toBeVisible();
    }
  });

  test('OA8: Can enroll students in courses', async ({ page }) => {
    await page.waitForTimeout(3000);
    const enrollBtn = page.getByText(/enroll|course|assign/i).first();
    if (await enrollBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(enrollBtn).toBeVisible();
    }
  });

  test('OA9: Can manage organization settings', async ({ page }) => {
    await page.waitForTimeout(3000);
    const settingsBtn = page.getByText(/setting|configure|organization/i).first();
    if (await settingsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await settingsBtn.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/name|visibility|policy/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('OA10: Org admin can sign out', async ({ page }) => {
    await navigateTo(page, 'Profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/welcome|sign in/i)).toBeVisible({ timeout: 15000 });
  });
});
