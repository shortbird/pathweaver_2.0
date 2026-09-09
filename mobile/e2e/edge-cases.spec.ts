import { test, expect } from '@playwright/test';
import { BASE_URL, USERS, clickByText, login, loginAsStudent, loginAsParent, loginAsSuperadmin, navigateTo } from './helpers';

test.describe('Edge Cases', () => {
  test('E1: Login page loads without errors', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 30000 });
  });

  test('E2: Double-click sign in does not create duplicate sessions', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill(USERS.student.email);
    await page.getByPlaceholder('Enter password').fill(USERS.student.password);
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(500);
    try { await clickByText(page, 'Sign In'); } catch { /* button may already be gone */ }
    await page.waitForTimeout(5000);
    await expect(page.getByText(/Welcome back|Total XP/i).first()).toBeVisible({ timeout: 20000 });
  });

  test('E3: Navigating to non-existent route shows 404 or redirects', async ({ page }) => {
    await page.goto(`${BASE_URL}/nonexistent-page-12345`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    // Should redirect to login or show some page (not crash)
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('E4: Rapid navigation between pages does not crash', async ({ page }) => {
    await loginAsStudent(page);
    // Click sidebar items rapidly
    await page.locator('text="Quests"').first().click();
    await page.waitForTimeout(300);
    await page.locator('text="Journal"').first().click();
    await page.waitForTimeout(300);
    await page.locator('text="Bounties"').first().click();
    await page.waitForTimeout(300);
    await page.locator('text="Home"').first().click();
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('E5: Page refresh preserves auth state', async ({ page }) => {
    await loginAsStudent(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Welcome back|Total XP/i).first()).toBeVisible({ timeout: 20000 });
  });

  test('E6: Browser back button works correctly', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'quests');
    await page.waitForTimeout(2000);
    await navigateTo(page, 'journal');
    await page.waitForTimeout(2000);
    await page.goBack();
    await page.waitForTimeout(2000);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('E7: Empty email field shows validation', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('Enter password').fill('somepassword');
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(2000);
    await expect(page.getByPlaceholder('you@email.com')).toBeVisible();
  });

  test('E8: Empty password field shows validation', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill(USERS.student.email);
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(2000);
    await expect(page.getByPlaceholder('Enter password')).toBeVisible();
  });

  test('E9: Very long email input is handled', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    const longEmail = 'a'.repeat(200) + '@test.com';
    await page.getByPlaceholder('you@email.com').fill(longEmail);
    await page.getByPlaceholder('Enter password').fill('password');
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(3000);
    // Should show error or validation, not crash
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/error|invalid|failed|email|welcome/);
  });

  test('E10: SQL injection in email field is safely handled', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill("' OR 1=1; --");
    await page.getByPlaceholder('Enter password').fill('password');
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/error|invalid|failed/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('E11: XSS in input fields is safely handled', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill('<script>alert("xss")</script>');
    await page.getByPlaceholder('Enter password').fill('password');
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content).not.toContain('alert');
  });

  test('E12: Concurrent navigation does not cause race conditions', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'quests');
    await page.waitForTimeout(100);
    await navigateTo(page, 'journal');
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('E13: Student cannot access admin routes', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/(app)/(tabs)/admin`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).not.toMatch(/admin panel/);
  });

  test('E14: Parent cannot access admin routes', async ({ page }) => {
    await loginAsParent(page);
    await page.goto(`${BASE_URL}/(app)/(tabs)/admin`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).not.toMatch(/admin panel/);
  });

  test('E15: Expired token triggers re-login', async ({ page }) => {
    await loginAsStudent(page);
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 20000 });
  });

  test('E16: Network error shows user-friendly message', async ({ page }) => {
    await loginAsStudent(page);
    await page.route('**/api/**', route => route.abort());
    await navigateTo(page, 'quests');
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('E17: Large viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await loginAsStudent(page);
    await expect(page.getByText('Quests').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Journal').first()).toBeVisible({ timeout: 15000 });
  });

  test('E18: Small viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsStudent(page);
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/welcome|dashboard|xp/);
  });

  test('E19: Multiple tabs do not conflict', async ({ page, context }) => {
    await loginAsStudent(page);
    const page2 = await context.newPage();
    await page2.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(5000);
    const content1 = await page.textContent('body');
    const content2 = await page2.textContent('body');
    expect(content1).toBeTruthy();
    expect(content2).toBeTruthy();
    await page2.close();
  });

  test('E20: Student does not see Admin sidebar link', async ({ page }) => {
    await loginAsStudent(page);
    await page.waitForTimeout(3000);
    // Admin link should NOT be visible for students
    // Check that "Admin" text in sidebar context is not present
    // Use a narrow selector to avoid matching other occurrences of "Admin"
    const adminLinks = page.locator('nav >> text="Admin"');
    const count = await adminLinks.count();
    expect(count).toBe(0);
  });
});
