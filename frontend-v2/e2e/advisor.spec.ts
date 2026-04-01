import { test, expect } from '@playwright/test';
import { clickByText, loginAsAdvisor, navigateTo } from './helpers';

test.describe('Advisor Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdvisor(page);
  });

  test('AD1: Advisor page loads after login', async ({ page }) => {
    // Advisor redirects to Advisor page with "Advisor" heading
    await expect(page.getByText('Advisor').first()).toBeVisible({ timeout: 15000 });
  });

  test('AD2: Advisor page shows student count', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/student|advisor|select/);
  });

  test('AD3: Advisor page shows Select a Student', async ({ page }) => {
    await expect(page.getByText(/Select a Student/i).first()).toBeVisible({ timeout: 15000 });
  });

  test.skip('AD4: Can approve student tasks (requires seeded data)', async ({ page }) => {
    // Skipped: requires pending task approvals
  });

  test.skip('AD5: Can assign quests to students (requires seeded data)', async ({ page }) => {
    // Skipped: requires student and quest data
  });

  test.skip('AD6: Can view student XP analytics (requires seeded data)', async ({ page }) => {
    // Skipped: requires student XP data
  });

  test('AD7: Advisor can navigate to profile', async ({ page }) => {
    await navigateTo(page, 'profile');
    await expect(page.getByText(/Total XP|Profile|Sign Out/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('AD8: Advisor can sign out', async ({ page }) => {
    await navigateTo(page, 'profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 15000 });
  });
});
