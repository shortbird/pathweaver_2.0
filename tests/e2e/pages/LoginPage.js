import { BasePage } from './BasePage.js';

/**
 * LoginPage - Page Object Model for /login
 *
 * Handles login form interactions and validation.
 */
export class LoginPage extends BasePage {
  constructor(page) {
    super(page);

    // Selectors using existing form IDs
    this.selectors = {
      // Form inputs
      emailInput: '#email',
      passwordInput: '#password',

      // Buttons
      submitButton: 'button[type="submit"]',
      showPasswordButton: 'button[aria-label="Show password"], button[aria-label="Hide password"]',
      googleButton: 'button:has-text("Google"), button:has-text("Sign in with Google")',

      // Links
      registerLink: 'a[href="/register"]',
      forgotPasswordLink: 'a[href="/forgot-password"]',

      // Error states
      loginError: '.bg-red-50, [role="alert"]',
      emailError: '#email-error',
      passwordError: '#password-error',

      // Page elements
      pageTitle: 'h2:has-text("Welcome back")',
    };
  }

  /**
   * Navigate to login page
   */
  async goto() {
    await super.goto('/login');
    await this.waitForElement(this.selectors.emailInput);
  }

  /**
   * Enter email address
   */
  async enterEmail(email) {
    await this.fill(this.selectors.emailInput, email);
  }

  /**
   * Enter password
   */
  async enterPassword(password) {
    await this.fill(this.selectors.passwordInput, password);
  }

  /**
   * Click submit button
   */
  async submit() {
    await this.click(this.selectors.submitButton);
  }

  /**
   * Perform full login flow
   */
  async login(email, password) {
    await this.enterEmail(email);
    await this.enterPassword(password);
    await this.submit();
  }

  /**
   * Wait for successful login (redirect to dashboard)
   */
  async waitForSuccessfulLogin() {
    // Wait for redirect away from login page
    await this.page.waitForURL(/\/(dashboard|quests|home|parent|observer)/, {
      timeout: 15000
    });
  }

  /**
   * Check if login error is displayed
   */
  async hasLoginError() {
    return this.isVisible(this.selectors.loginError, 3000);
  }

  /**
   * Get login error message
   */
  async getErrorMessage() {
    if (await this.hasLoginError()) {
      return this.getText(this.selectors.loginError);
    }
    return null;
  }

  /**
   * Check if email validation error is shown
   */
  async hasEmailError() {
    return this.isVisible(this.selectors.emailError, 2000);
  }

  /**
   * Check if password validation error is shown
   */
  async hasPasswordError() {
    return this.isVisible(this.selectors.passwordError, 2000);
  }

  /**
   * Get email validation error text
   */
  async getEmailError() {
    if (await this.hasEmailError()) {
      return this.getText(this.selectors.emailError);
    }
    return null;
  }

  /**
   * Get password validation error text
   */
  async getPasswordError() {
    if (await this.hasPasswordError()) {
      return this.getText(this.selectors.passwordError);
    }
    return null;
  }

  /**
   * Toggle password visibility
   */
  async togglePasswordVisibility() {
    await this.click(this.selectors.showPasswordButton);
  }

  /**
   * Check if password is visible (text type instead of password)
   */
  async isPasswordVisible() {
    const type = await this.page.$eval(this.selectors.passwordInput, el => el.type);
    return type === 'text';
  }

  /**
   * Click "Create account" link
   */
  async goToRegister() {
    await this.click(this.selectors.registerLink);
    await this.waitForUrl('/register');
  }

  /**
   * Click "Forgot password" link
   */
  async goToForgotPassword() {
    await this.click(this.selectors.forgotPasswordLink);
    await this.waitForUrl('/forgot-password');
  }

  /**
   * Check if Google sign-in button is present
   */
  async hasGoogleButton() {
    return this.isVisible(this.selectors.googleButton, 2000);
  }

  /**
   * Check if page title is visible
   */
  async isLoaded() {
    return this.isVisible(this.selectors.pageTitle, 5000);
  }

  /**
   * Check if submit button is disabled (loading state)
   */
  async isSubmitDisabled() {
    const button = await this.page.$(this.selectors.submitButton);
    if (!button) return false;
    return button.isDisabled();
  }

  /**
   * Check if loading spinner is visible
   */
  async isLoading() {
    return this.isVisible(`${this.selectors.submitButton} .animate-spin`, 1000);
  }
}
