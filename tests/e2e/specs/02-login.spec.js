import { test, expect } from '@playwright/test';
import { LoginPage } from '../pages/LoginPage.js';
import { TEST_USER, VALID_PASSWORD } from '../fixtures/auth.fixture.js';

/**
 * Login Tests
 *
 * Verifies:
 * - Login form displays correctly
 * - Valid credentials work
 * - Invalid credentials show error
 * - Validation errors display
 * - Session persists after login
 */
test.describe('Login', () => {
  let loginPage;

  test.beforeEach(async ({ page }) => {
    loginPage = new LoginPage(page);
    await loginPage.goto();
  });

  test('login form displays correctly', async () => {
    // Check page loaded
    expect(await loginPage.isLoaded()).toBe(true);

    // Verify form fields
    await expect(loginPage.page.locator('#email')).toBeVisible();
    await expect(loginPage.page.locator('#password')).toBeVisible();

    // Verify submit button
    await expect(loginPage.page.locator('button[type="submit"]')).toBeVisible();
    await expect(loginPage.page.locator('button[type="submit"]')).toContainText('Sign in');

    // Verify Google sign-in option
    expect(await loginPage.hasGoogleButton()).toBe(true);

    // Verify links (use first() as nav and in-form links exist)
    await expect(loginPage.page.locator('a[href="/register"]').first()).toBeVisible();
    await expect(loginPage.page.locator('a[href="/forgot-password"]')).toBeVisible();
  });

  test('successful login redirects to dashboard', async () => {
    // Login with valid credentials
    await loginPage.login(TEST_USER.email, TEST_USER.password);

    // Wait for successful login
    await loginPage.waitForSuccessfulLogin();

    // Should be on dashboard or quests page
    const url = loginPage.page.url();
    expect(url).toMatch(/\/(dashboard|quests|home|parent|observer)/);
  });

  test('invalid credentials show error message', async () => {
    // Login with invalid credentials
    await loginPage.login('invalid@example.com', 'WrongPassword123!');

    // Wait for error
    await loginPage.page.waitForTimeout(2000);

    // Should show login error
    expect(await loginPage.hasLoginError()).toBe(true);

    // Should still be on login page
    expect(loginPage.hasUrl('/login')).toBe(true);
  });

  test('shows validation error for empty fields', async () => {
    // Clear and try to submit empty form
    await loginPage.submit();

    // Wait for validation
    await loginPage.page.waitForTimeout(500);

    // Should show email error
    expect(await loginPage.hasEmailError()).toBe(true);

    // Enter only email and submit
    await loginPage.enterEmail('test@example.com');
    await loginPage.submit();

    // Wait for validation
    await loginPage.page.waitForTimeout(500);

    // Should show password error
    expect(await loginPage.hasPasswordError()).toBe(true);
  });

  test('session persists after successful login', async () => {
    // Login
    await loginPage.login(TEST_USER.email, TEST_USER.password);
    await loginPage.waitForSuccessfulLogin();

    // Navigate to another page
    await loginPage.page.goto('/quests');
    await loginPage.page.waitForTimeout(3000);

    // Should still be authenticated (not redirected to login)
    const url = loginPage.page.url();
    expect(url).not.toContain('/login');

    // Should see authenticated UI elements
    // Look for "Create Quest" button which only appears for authenticated users
    const createQuestButton = loginPage.page.locator('button:has-text("Create Quest")');
    await expect(createQuestButton).toBeVisible({ timeout: 10000 });
  });
});
