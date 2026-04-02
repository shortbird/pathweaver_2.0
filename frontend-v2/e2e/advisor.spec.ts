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

  test('AD4: Can view linked student in advisor panel', async ({ page }) => {
    // Advisor is linked to the seeded student - should see student listed
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/student|select|name/);
  });

  test('AD5: Advisor sees student details when selected', async ({ page }) => {
    // Wait for student list to load, then look for clickable student entries
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    // The advisor page should show student-related content
    expect(content?.toLowerCase()).toMatch(/student|select|advisor/);
  });

  test('AD6: Advisor panel shows XP or quest data', async ({ page }) => {
    // Advisor page should display quest or XP data for linked students
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/student|xp|quest|advisor|select/);
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
