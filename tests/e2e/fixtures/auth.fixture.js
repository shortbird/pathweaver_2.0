import { test as base, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';

/**
 * Test user credentials
 * Using existing test account in the system
 */
export const TEST_USER = {
  email: 'test@optioeducation.com',
  password: 'TestPassword123!'
};

/**
 * Generate unique email for registration tests
 */
export function generateTestEmail() {
  const timestamp = Date.now();
  return `e2e_test_${timestamp}@example.com`;
}

/**
 * Strong password that meets all requirements
 * - At least 12 characters
 * - Uppercase letter
 * - Lowercase letter
 * - Number
 * - Special character
 */
export const VALID_PASSWORD = 'TestPassword123!';

/**
 * Weak password for validation tests
 */
export const WEAK_PASSWORD = 'weak';

/**
 * Extended test fixture with authentication helpers
 */
export const test = base.extend({
  /**
   * Authenticated page - logs in before each test
   */
  authenticatedPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await loginPage.goto();
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.waitForSuccessfulLogin();
    await use(page);
  },

  /**
   * Login page instance
   */
  loginPage: async ({ page }, use) => {
    const loginPage = new LoginPage(page);
    await use(loginPage);
  },
});

export { expect };

/**
 * Helper to wait for authenticated state
 */
export async function waitForAuth(page) {
  // Wait for dashboard or similar authenticated route
  await page.waitForURL(/\/(dashboard|quests|home)/, { timeout: 15000 });
}

/**
 * Helper to check if user is logged in
 */
export async function isLoggedIn(page) {
  // Check for presence of user menu or dashboard elements
  try {
    await page.waitForSelector('[data-testid="user-menu"], .user-avatar, [href="/dashboard"]', {
      state: 'visible',
      timeout: 3000
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Helper to logout
 */
export async function logout(page) {
  // Click user menu and then logout
  try {
    await page.click('[data-testid="user-menu"], .user-avatar');
    await page.click('text=Sign out, text=Logout, text=Log out');
    await page.waitForURL('**/login**', { timeout: 5000 });
  } catch {
    // If menu approach fails, navigate directly
    await page.goto('/logout');
  }
}
