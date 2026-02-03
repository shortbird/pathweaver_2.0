import { BasePage } from './BasePage.js';

/**
 * RegisterPage - Page Object Model for /register
 *
 * Handles registration form interactions and validation.
 */
export class RegisterPage extends BasePage {
  constructor(page) {
    super(page);

    // Selectors using existing form IDs
    this.selectors = {
      // Form inputs
      firstNameInput: '#first_name',
      lastNameInput: '#last_name',
      emailInput: '#email',
      dateOfBirthInput: '#date_of_birth',
      passwordInput: '#password',
      confirmPasswordInput: '#confirmPassword',

      // Checkboxes
      legalTermsCheckbox: '#acceptedLegalTerms',
      portfolioVisibilityCheckbox: '#acceptedPortfolioVisibility',

      // Buttons
      submitButton: 'button[type="submit"]',
      showPasswordButton: 'button[aria-label="Show password"]',
      googleButton: 'button:has-text("Google"), button:has-text("Sign up with Google")',

      // Links
      loginLink: 'a[href="/login"]',

      // Error states
      firstNameError: '#first-name-error',
      lastNameError: '#last-name-error',
      emailError: '#email-error',
      dobError: '#date-of-birth-error',
      passwordError: '#password-error',
      confirmPasswordError: '#confirm-password-error',
      legalTermsError: '#legal-terms-error',
      portfolioVisibilityError: '#portfolio-visibility-error',

      // Page elements
      pageTitle: 'h2:has-text("Create your account")',
      passwordStrengthMeter: '[class*="PasswordStrengthMeter"], .password-strength',
      under13Warning: 'text=Parent Account Required',
    };
  }

  /**
   * Navigate to register page
   */
  async goto() {
    await super.goto('/register');
    await this.waitForElement(this.selectors.emailInput);
  }

  /**
   * Enter first name
   */
  async enterFirstName(name) {
    await this.fill(this.selectors.firstNameInput, name);
  }

  /**
   * Enter last name
   */
  async enterLastName(name) {
    await this.fill(this.selectors.lastNameInput, name);
  }

  /**
   * Enter email address
   */
  async enterEmail(email) {
    await this.fill(this.selectors.emailInput, email);
  }

  /**
   * Enter date of birth (format: YYYY-MM-DD)
   */
  async enterDateOfBirth(date) {
    await this.fill(this.selectors.dateOfBirthInput, date);
  }

  /**
   * Enter password
   */
  async enterPassword(password) {
    await this.fill(this.selectors.passwordInput, password);
  }

  /**
   * Enter confirm password
   */
  async enterConfirmPassword(password) {
    await this.fill(this.selectors.confirmPasswordInput, password);
  }

  /**
   * Accept legal terms (Terms of Service and Privacy Policy)
   */
  async acceptLegalTerms() {
    await this.page.check(this.selectors.legalTermsCheckbox);
  }

  /**
   * Accept portfolio visibility acknowledgment
   */
  async acceptPortfolioVisibility() {
    await this.page.check(this.selectors.portfolioVisibilityCheckbox);
  }

  /**
   * Click submit button
   */
  async submit() {
    await this.click(this.selectors.submitButton);
  }

  /**
   * Fill out the entire registration form
   */
  async fillForm({ firstName, lastName, email, dateOfBirth, password, confirmPassword }) {
    await this.enterFirstName(firstName);
    await this.enterLastName(lastName);
    await this.enterEmail(email);
    await this.enterDateOfBirth(dateOfBirth);
    await this.enterPassword(password);
    await this.enterConfirmPassword(confirmPassword || password);
  }

  /**
   * Perform full registration (fill form + accept terms + submit)
   */
  async register({ firstName, lastName, email, dateOfBirth, password }) {
    await this.fillForm({
      firstName,
      lastName,
      email,
      dateOfBirth,
      password,
      confirmPassword: password
    });
    await this.acceptLegalTerms();
    await this.acceptPortfolioVisibility();
    await this.submit();
  }

  /**
   * Check if password strength meter is visible
   */
  async hasPasswordStrengthMeter() {
    // The meter appears after entering password
    return this.isVisible('.space-y-1 .h-1, [class*="strength"]', 2000);
  }

  /**
   * Check if under 13 warning is displayed
   */
  async hasUnder13Warning() {
    return this.isVisible(this.selectors.under13Warning, 2000);
  }

  /**
   * Check for validation errors
   */
  async hasFirstNameError() {
    return this.isVisible(this.selectors.firstNameError, 2000);
  }

  async hasLastNameError() {
    return this.isVisible(this.selectors.lastNameError, 2000);
  }

  async hasEmailError() {
    return this.isVisible(this.selectors.emailError, 2000);
  }

  async hasPasswordError() {
    return this.isVisible(this.selectors.passwordError, 2000);
  }

  async hasConfirmPasswordError() {
    return this.isVisible(this.selectors.confirmPasswordError, 2000);
  }

  async hasLegalTermsError() {
    return this.isVisible(this.selectors.legalTermsError, 2000);
  }

  /**
   * Get specific error messages
   */
  async getFirstNameError() {
    if (await this.hasFirstNameError()) {
      return this.getText(this.selectors.firstNameError);
    }
    return null;
  }

  async getEmailError() {
    if (await this.hasEmailError()) {
      return this.getText(this.selectors.emailError);
    }
    return null;
  }

  async getPasswordError() {
    if (await this.hasPasswordError()) {
      return this.getText(this.selectors.passwordError);
    }
    return null;
  }

  async getConfirmPasswordError() {
    if (await this.hasConfirmPasswordError()) {
      return this.getText(this.selectors.confirmPasswordError);
    }
    return null;
  }

  /**
   * Check if page is loaded
   */
  async isLoaded() {
    return this.isVisible(this.selectors.pageTitle, 5000);
  }

  /**
   * Check if submit button is disabled
   */
  async isSubmitDisabled() {
    const button = await this.page.$(this.selectors.submitButton);
    if (!button) return false;
    return button.isDisabled();
  }

  /**
   * Check if Google sign-up button is present
   */
  async hasGoogleButton() {
    return this.isVisible(this.selectors.googleButton, 2000);
  }

  /**
   * Go to login page
   */
  async goToLogin() {
    await this.click(this.selectors.loginLink);
    await this.waitForUrl('/login');
  }

  /**
   * Generate a valid date of birth for an adult
   */
  static getAdultDateOfBirth() {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 20);
    return date.toISOString().split('T')[0];
  }

  /**
   * Generate a date of birth for someone under 13
   */
  static getChildDateOfBirth() {
    const date = new Date();
    date.setFullYear(date.getFullYear() - 10);
    return date.toISOString().split('T')[0];
  }
}
