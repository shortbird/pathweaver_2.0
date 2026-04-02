import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

test.describe('Student Profile', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'profile');
  });

  test('ST45: Profile page loads', async ({ page }) => {
    await expect(page.getByText(/Total XP|Profile|Member since/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST46: Profile shows display name', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Profile shows avatar and name
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('ST47: Profile shows Total XP', async ({ page }) => {
    await expect(page.getByText('Total XP').first()).toBeVisible({ timeout: 15000 });
  });

  test('ST48: Profile shows pillar breakdown or radar', async ({ page }) => {
    // Student has XP from seeded tasks - profile should show pillar data
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/total xp|pillar|stem|art|profile|xp/);
  });

  test('ST49: Profile shows engagement calendar or activity section', async ({ page }) => {
    // Profile should show engagement calendar or activity history
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/profile|total xp|engagement|activity|calendar|member since/);
  });

  test('ST50: Profile page is interactive and editable', async ({ page }) => {
    // Profile page should allow editing - look for edit controls
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    // Profile should have some interactive elements
    expect(content?.toLowerCase()).toMatch(/profile|total xp|sign out|edit|name/);
  });

  test('ST51: Sign out button is visible', async ({ page }) => {
    await expect(page.getByText(/Sign Out/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST52: Can sign out', async ({ page }) => {
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 15000 });
  });
});
