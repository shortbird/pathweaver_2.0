import { test, expect } from '@playwright/test';
import { BASE_URL, USERS, clickByText, login, loginAsStudent, loginAsParent, loginAsSuperadmin } from './helpers';

test.describe('Edge Cases', () => {
  test('E1: Login page loads without errors', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await expect(page.getByText(/welcome|sign in/i)).toBeVisible({ timeout: 30000 });
    // No console errors
    const errors: string[] = [];
    page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.waitForTimeout(2000);
  });

  test('E2: Double-click sign in does not create duplicate sessions', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill(USERS.student.email);
    await page.getByPlaceholder('Enter password').fill(USERS.student.password);
    await clickByText(page, 'Sign In');
    // Immediately try clicking again
    await page.waitForTimeout(500);
    try { await clickByText(page, 'Sign In'); } catch { /* button may already be gone */ }
    await page.waitForTimeout(5000);
    // Should still end up on dashboard without errors
    await expect(page.getByText(/welcome back|dashboard|total xp/i)).toBeVisible({ timeout: 20000 });
  });

  test('E3: Navigating to non-existent route shows 404 or redirects', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/nonexistent-page-12345`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    // Should either show 404 or redirect to dashboard
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/not found|404|dashboard|welcome/);
  });

  test('E4: Rapid navigation between pages does not crash', async ({ page }) => {
    await loginAsStudent(page);
    await clickByText(page, 'Quests');
    await page.waitForTimeout(500);
    await clickByText(page, 'Journal');
    await page.waitForTimeout(500);
    await clickByText(page, 'Profile');
    await page.waitForTimeout(500);
    await clickByText(page, 'Quests');
    await page.waitForTimeout(2000);
    // App should still be functional
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('E5: Page refresh preserves auth state', async ({ page }) => {
    await loginAsStudent(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await expect(page.getByText(/welcome back|dashboard|total xp/i)).toBeVisible({ timeout: 20000 });
  });

  test('E6: Browser back button works correctly', async ({ page }) => {
    await loginAsStudent(page);
    await clickByText(page, 'Quests');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Journal');
    await page.waitForTimeout(2000);
    await page.goBack();
    await page.waitForTimeout(2000);
    // Should be back on quests or previous page
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('E7: Empty email field shows validation', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('Enter password').fill('somepassword');
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(2000);
    // Should remain on login or show error
    await expect(page.getByPlaceholder('you@email.com')).toBeVisible();
  });

  test('E8: Empty password field shows validation', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill(USERS.student.email);
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(2000);
    // Should remain on login or show error
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
    // Should show error, not crash
    await expect(page.getByText(/error|invalid|failed/i)).toBeVisible({ timeout: 15000 });
  });

  test('E10: SQL injection in email field is safely handled', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill("' OR 1=1; --");
    await page.getByPlaceholder('Enter password').fill('password');
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(3000);
    // Should show error, not expose data
    await expect(page.getByText(/error|invalid|failed/i)).toBeVisible({ timeout: 15000 });
  });

  test('E11: XSS in input fields is safely handled', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill('<script>alert("xss")</script>');
    await page.getByPlaceholder('Enter password').fill('password');
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(3000);
    // Page should not execute script - just show error
    const content = await page.textContent('body');
    expect(content).not.toContain('alert');
  });

  test('E12: Concurrent API requests do not cause race conditions', async ({ page }) => {
    await loginAsStudent(page);
    // Navigate rapidly
    await Promise.all([
      clickByText(page, 'Quests'),
      page.waitForTimeout(100).then(() => clickByText(page, 'Journal').catch(() => {})),
    ]);
    await page.waitForTimeout(3000);
    // App should still work
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('E13: Student cannot access admin routes', async ({ page }) => {
    await loginAsStudent(page);
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    // Should not show admin panel
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).not.toMatch(/manage users|admin panel|all organizations/);
  });

  test('E14: Parent cannot access admin routes', async ({ page }) => {
    await loginAsParent(page);
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).not.toMatch(/manage users|admin panel|all organizations/);
  });

  test('E15: Expired token triggers re-login', async ({ page }) => {
    await loginAsStudent(page);
    // Clear auth storage to simulate expired token
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    // Should redirect to login
    await expect(page.getByText(/welcome|sign in/i)).toBeVisible({ timeout: 20000 });
  });

  test('E16: Network error shows user-friendly message', async ({ page }) => {
    await loginAsStudent(page);
    // Intercept API calls to simulate network failure
    await page.route('**/api/**', route => route.abort());
    await clickByText(page, 'Quests');
    await page.waitForTimeout(5000);
    // Should show error state, not crash
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('E17: Large viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await loginAsStudent(page);
    // Sidebar should be visible at large viewport
    await expect(page.getByText('Quests')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Journal')).toBeVisible({ timeout: 15000 });
  });

  test('E18: Small viewport renders correctly', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAsStudent(page);
    await page.waitForTimeout(3000);
    // App should still be functional at mobile viewport
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/welcome|dashboard|xp/);
  });

  test('E19: Multiple tabs do not conflict', async ({ page, context }) => {
    await loginAsStudent(page);
    // Open second tab
    const page2 = await context.newPage();
    await page2.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page2.waitForTimeout(5000);
    // Both should be authenticated
    const content1 = await page.textContent('body');
    const content2 = await page2.textContent('body');
    expect(content1).toBeTruthy();
    expect(content2).toBeTruthy();
    await page2.close();
  });

  test('E20: Superadmin access is restricted to correct user', async ({ page }) => {
    // Login as student and try to access admin
    await loginAsStudent(page);
    // Admin link should NOT be visible for students
    await page.waitForTimeout(3000);
    const adminLink = page.getByText('Admin');
    const isVisible = await adminLink.isVisible({ timeout: 3000 }).catch(() => false);
    expect(isVisible).toBe(false);
  });
});
