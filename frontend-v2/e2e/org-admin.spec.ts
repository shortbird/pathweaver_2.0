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

  test.skip('OA3: Can invite new members (requires interaction)', async ({ page }) => {
    // Skipped: invite flow requires specific interaction
  });

  test.skip('OA4: Can change member roles (requires seeded data)', async ({ page }) => {
    // Skipped: requires organization member data
  });

  test.skip('OA5: Can view organization quests (requires seeded data)', async ({ page }) => {
    // Skipped: requires organization quest data
  });

  test.skip('OA6: Can create quests for organization (requires interaction)', async ({ page }) => {
    // Skipped: quest creation requires specific interaction
  });

  test.skip('OA7: Can view organization analytics (requires seeded data)', async ({ page }) => {
    // Skipped: requires analytics data
  });

  test.skip('OA8: Can enroll students in courses (requires seeded data)', async ({ page }) => {
    // Skipped: requires course and student data
  });

  test.skip('OA9: Can manage organization settings (requires interaction)', async ({ page }) => {
    // Skipped: settings management requires specific interaction
  });

  test('OA10: Org admin can sign out', async ({ page }) => {
    await navigateTo(page, 'profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 15000 });
  });
});
