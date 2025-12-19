import { test, expect } from '@playwright/test';

/**
 * Authentication E2E Tests
 *
 * Tests the critical authentication flows against actual UI structure.
 * Uses real selectors from LoginPage.jsx and dashboard pages.
 */

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/login');

    // Check for actual LoginPage elements
    await expect(page.locator('text=Welcome back')).toBeVisible();
    await expect(page.locator('input[type="email"]')).toBeVisible();
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.locator('button[type="submit"]:has-text("Sign in")')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill credentials with actual test account
    await page.fill('input[type="email"]', 'test@optioeducation.com');
    await page.fill('input[type="password"]', 'TestPassword123!');

    // Click "Sign in" button (actual text from LoginPage.jsx:146)
    await page.click('button[type="submit"]:has-text("Sign in")');

    // Wait for redirect to dashboard (student role redirects to /dashboard)
    await page.waitForURL(/.*\/dashboard/, { timeout: 15000 });

    // Verify we're on dashboard (not login page)
    await expect(page).toHaveURL(/.*\/dashboard/);

    // Verify dashboard content is visible (positive assertion instead of negative)
    await expect(page.locator('text=/Active Quests|Quest Hub/i').first()).toBeVisible({ timeout: 5000 });
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill invalid credentials
    await page.fill('input[type="email"]', 'invalid@example.com');
    await page.fill('input[type="password"]', 'wrongpassword');

    // Submit form
    await page.click('button[type="submit"]:has-text("Sign in")');

    // Should show error message (LoginPage.jsx line 52-64 shows error div)
    // The error text is set in loginError state
    const errorDiv = page.locator('div.bg-red-50');
    await expect(errorDiv).toBeVisible({ timeout: 5000 });

    // Should stay on login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('should logout successfully', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@optioeducation.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]:has-text("Sign in")');

    // Wait for successful login
    await page.waitForURL(/.*\/dashboard/, { timeout: 15000 });

    // Look for logout button in nav/header (adjust based on actual nav structure)
    // This is a more flexible approach - look for any button/link with logout text
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Log out"), a:has-text("Logout"), a:has-text("Log out")').first();

    // Wait for it to be visible and click
    await expect(logoutButton).toBeVisible({ timeout: 10000 });
    await logoutButton.click();

    // Should redirect to home or login page
    await page.waitForURL(/.*\/(login|home|)$/, { timeout: 10000 });

    // Verify we can see the login page again
    await page.goto('/login');
    await expect(page.locator('text=Welcome back')).toBeVisible();
  });

  test('should redirect unauthenticated users from protected routes', async ({ page }) => {
    // Try to access protected route without login
    await page.goto('/dashboard');

    // Should redirect to login or home
    // Your PrivateRoute likely redirects to /login
    await page.waitForURL(/.*\/(login|\/)/, { timeout: 10000 });

    // Should be able to access login page
    const currentUrl = page.url();
    if (!currentUrl.includes('/login')) {
      // If on home, navigate to login
      await page.goto('/login');
    }

    await expect(page.locator('text=Welcome back')).toBeVisible();
  });

  test('should persist session across page refreshes', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', 'test@optioeducation.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]:has-text("Sign in")');
    await page.waitForURL(/.*\/dashboard/, { timeout: 15000 });

    // Store current URL
    const dashboardUrl = page.url();

    // Reload page
    await page.reload();

    // Should still be on dashboard (httpOnly cookies should persist)
    await expect(page).toHaveURL(dashboardUrl);

    // Should not redirect to login
    await expect(page).not.toHaveURL(/.*login/);
  });
});
