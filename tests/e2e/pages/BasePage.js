/**
 * BasePage - Common methods for all Page Object Models
 *
 * Provides shared functionality like navigation, waiting,
 * and common element interactions.
 */
export class BasePage {
  constructor(page) {
    this.page = page;
    this.timeout = 15000;
  }

  /**
   * Navigate to a path relative to baseURL
   */
  async goto(path = '') {
    await this.page.goto(path, { waitUntil: 'networkidle' });
  }

  /**
   * Wait for navigation to complete
   */
  async waitForNavigation() {
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Wait for an element to be visible
   */
  async waitForElement(selector, options = {}) {
    return this.page.waitForSelector(selector, {
      state: 'visible',
      timeout: this.timeout,
      ...options
    });
  }

  /**
   * Click an element with retry logic
   */
  async click(selector) {
    await this.page.click(selector, { timeout: this.timeout });
  }

  /**
   * Fill an input field (clears first)
   */
  async fill(selector, value) {
    await this.page.fill(selector, value, { timeout: this.timeout });
  }

  /**
   * Get text content of an element
   */
  async getText(selector) {
    const element = await this.page.waitForSelector(selector, {
      state: 'visible',
      timeout: this.timeout
    });
    return element.textContent();
  }

  /**
   * Check if an element is visible
   */
  async isVisible(selector, timeout = 5000) {
    try {
      await this.page.waitForSelector(selector, {
        state: 'visible',
        timeout
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Wait for URL to contain a specific path
   */
  async waitForUrl(urlPath, timeout = 20000) {
    await this.page.waitForURL(`**${urlPath}**`, { timeout });
  }

  /**
   * Check if current URL contains path
   */
  hasUrl(urlPath) {
    return this.page.url().includes(urlPath);
  }

  /**
   * Wait for toast notification and return its text
   */
  async getToastMessage(timeout = 5000) {
    try {
      // React Hot Toast uses role="status" or specific classes
      const toast = await this.page.waitForSelector('[role="status"], .react-hot-toast', {
        state: 'visible',
        timeout
      });
      return toast.textContent();
    } catch {
      return null;
    }
  }

  /**
   * Wait for loading state to complete
   */
  async waitForLoadingComplete() {
    // Wait for any spinners to disappear
    await this.page.waitForSelector('.animate-spin', {
      state: 'hidden',
      timeout: this.timeout
    }).catch(() => {});

    // Wait for network to be idle
    await this.page.waitForLoadState('networkidle');
  }

  /**
   * Take a screenshot for debugging
   */
  async screenshot(name) {
    await this.page.screenshot({
      path: `test-results/screenshots/${name}.png`,
      fullPage: true
    });
  }
}
