import { test, expect } from '@playwright/test';
import { RegisterPage } from '../pages/RegisterPage.js';
import { generateTestEmail, VALID_PASSWORD, WEAK_PASSWORD } from '../fixtures/auth.fixture.js';

/**
 * Account Creation Tests
 *
 * Verifies:
 * - Registration form displays correctly
 * - Field validation works
 * - Password strength meter shown
 * - Age verification (under 13 warning)
 * - Terms acceptance required
 */
test.describe('Account Creation', () => {
  let registerPage;

  test.beforeEach(async ({ page }) => {
    registerPage = new RegisterPage(page);
    await registerPage.goto();
  });

  test('registration form displays all required fields', async () => {
    // Check page loaded
    expect(await registerPage.isLoaded()).toBe(true);

    // Verify all form fields are visible
    await expect(registerPage.page.locator('#first_name')).toBeVisible();
    await expect(registerPage.page.locator('#last_name')).toBeVisible();
    await expect(registerPage.page.locator('#email')).toBeVisible();
    await expect(registerPage.page.locator('#date_of_birth')).toBeVisible();
    await expect(registerPage.page.locator('#password')).toBeVisible();
    await expect(registerPage.page.locator('#confirmPassword')).toBeVisible();
    await expect(registerPage.page.locator('#acceptedLegalTerms')).toBeVisible();
    await expect(registerPage.page.locator('#acceptedPortfolioVisibility')).toBeVisible();

    // Verify submit button
    await expect(registerPage.page.locator('button[type="submit"]')).toBeVisible();
    await expect(registerPage.page.locator('button[type="submit"]')).toContainText('Create account');

    // Verify Google sign-up option
    expect(await registerPage.hasGoogleButton()).toBe(true);

    // Verify link to login (use first() as nav and in-form links exist)
    await expect(registerPage.page.locator('a[href="/login"]').first()).toBeVisible();
  });

  test('shows validation errors for empty form submission', async () => {
    // Try to submit empty form
    await registerPage.submit();

    // Wait for validation
    await registerPage.page.waitForTimeout(500);

    // Check for required field errors
    expect(await registerPage.hasFirstNameError()).toBe(true);
  });

  test('shows password strength meter when typing password', async () => {
    // Enter a password to trigger strength meter
    await registerPage.enterPassword('Test');

    // Password strength meter should appear
    // Component uses h-2 class and shows "Password Strength" label
    const strengthLabel = registerPage.page.locator('text=Password Strength');
    await expect(strengthLabel).toBeVisible({ timeout: 3000 });

    // The strength bar uses h-2 class
    const strengthBar = registerPage.page.locator('.h-2.bg-gray-200');
    await expect(strengthBar).toBeVisible({ timeout: 3000 });

    // Enter a stronger password
    await registerPage.enterPassword(VALID_PASSWORD);

    // Meter should still be visible
    await expect(strengthLabel).toBeVisible();
  });

  test('shows warning for users under 13 years old', async () => {
    // Enter date of birth for someone under 13
    const childDob = RegisterPage.getChildDateOfBirth();
    await registerPage.enterDateOfBirth(childDob);

    // Trigger blur to process date
    await registerPage.page.locator('#email').click();

    // Wait for age check
    await registerPage.page.waitForTimeout(500);

    // Should show under 13 warning
    expect(await registerPage.hasUnder13Warning()).toBe(true);

    // Submit button should be disabled
    expect(await registerPage.isSubmitDisabled()).toBe(true);
  });

  test('validates password requirements', async () => {
    // Fill basic fields first
    await registerPage.enterFirstName('Test');
    await registerPage.enterLastName('User');
    await registerPage.enterEmail(generateTestEmail());
    await registerPage.enterDateOfBirth(RegisterPage.getAdultDateOfBirth());

    // Enter weak password
    await registerPage.enterPassword(WEAK_PASSWORD);
    await registerPage.enterConfirmPassword(WEAK_PASSWORD);

    // Accept terms
    await registerPage.acceptLegalTerms();
    await registerPage.acceptPortfolioVisibility();

    // Try to submit
    await registerPage.submit();

    // Wait for validation
    await registerPage.page.waitForTimeout(500);

    // Should show password error
    expect(await registerPage.hasPasswordError()).toBe(true);

    const errorText = await registerPage.getPasswordError();
    expect(errorText).toBeTruthy();
    expect(errorText.toLowerCase()).toContain('password');
  });
});
