import { test, expect } from '@playwright/test';

/**
 * Authentication E2E Tests
 *
 * Tests the critical authentication flows:
 * - Login with valid credentials
 * - Login with invalid credentials
 * - Logout
 * - Protected route access
 * - Token persistence (httpOnly cookies)
 */

test.describe('Authentication', () => {
  test('should display login page', async ({ page }) => {
    await page.goto('/');

    // Should show login/register options
    await expect(page.locator('text=/login|sign in/i')).toBeVisible();
  });

  test('should login with valid credentials', async ({ page }) => {
    await page.goto('/');

    // Navigate to login (adjust selectors based on your actual UI)
    const loginButton = page.locator('button:has-text("Login"), a:has-text("Login")').first();
    await loginButton.click();

    // Wait for login form
    await page.waitForURL('**/login', { timeout: 10000 });

    // Fill credentials
    await page.fill('input[type="email"], input[name="email"]', 'test@optioeducation.com');
    await page.fill('input[type="password"], input[name="password"]', 'TestPassword123!');

    // Submit form
    await page.click('button[type="submit"]');

    // Should redirect to dashboard or quest hub after login
    await page.waitForURL(/.*\/(dashboard|quest-hub|quests)/, { timeout: 15000 });

    // Verify user is logged in (look for user menu, profile, or logout button)
    const userIndicators = [
      page.locator('text=/logout|sign out/i'),
      page.locator('text=/my quests|my badges/i'),
      page.locator('[data-testid="user-menu"]'),
      page.locator('button:has-text("Profile")')
    ];

    // At least one indicator should be visible
    const visibleIndicator = await Promise.race(
      userIndicators.map(async (locator) => {
        try {
          await locator.waitFor({ timeout: 5000 });
          return true;
        } catch {
          return false;
        }
      })
    );

    expect(visibleIndicator).toBeTruthy();
  });

  test('should show error for invalid credentials', async ({ page }) => {
    await page.goto('/login');

    // Fill invalid credentials
    await page.fill('input[type="email"], input[name="email"]', 'invalid@example.com');
    await page.fill('input[type="password"], input[name="password"]', 'wrongpassword');

    // Submit form
    await page.click('button[type="submit"]');

    // Should show error message (wait for error to appear)
    const errorMessage = page.locator('text=/invalid|incorrect|wrong|error/i');
    await expect(errorMessage).toBeVisible({ timeout: 5000 });

    // Should stay on login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('should logout successfully', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', 'test@optioeducation.com');
    await page.fill('input[type="password"], input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');

    // Wait for successful login
    await page.waitForURL(/.*\/(dashboard|quest-hub|quests)/, { timeout: 15000 });

    // Find and click logout button
    const logoutButton = page.locator('button:has-text("Logout"), button:has-text("Sign Out"), a:has-text("Logout")').first();
    await logoutButton.click();

    // Should redirect to home or login page
    await page.waitForURL(/.*\/(|login|home)$/, { timeout: 10000 });

    // Should show login button again
    await expect(page.locator('text=/login|sign in/i')).toBeVisible();
  });

  test('should redirect unauthenticated users from protected routes', async ({ page }) => {
    // Try to access protected route without login
    await page.goto('/dashboard');

    // Should redirect to login or home
    await page.waitForURL(/.*\/(login|home|\/)/, { timeout: 10000 });

    // Should show login form
    await expect(page.locator('text=/login|sign in/i')).toBeVisible();
  });

  test('should persist session across page refreshes', async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"], input[name="email"]', 'test@optioeducation.com');
    await page.fill('input[type="password"], input[name="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL(/.*\/(dashboard|quest-hub|quests)/, { timeout: 15000 });

    // Reload page
    await page.reload();

    // Should still be logged in (not redirected to login)
    await expect(page).not.toHaveURL(/.*login/);

    // Should show user-specific content
    const userIndicators = [
      page.locator('text=/logout|sign out/i'),
      page.locator('text=/my quests|my badges/i')
    ];

    const visibleIndicator = await Promise.race(
      userIndicators.map(async (locator) => {
        try {
          await locator.waitFor({ timeout: 5000 });
          return true;
        } catch {
          return false;
        }
      })
    );

    expect(visibleIndicator).toBeTruthy();
  });
});
