import { BasePage } from './BasePage.js';

/**
 * QuestHubPage - Page Object Model for /quests (Quest Discovery)
 *
 * Handles quest discovery, search, filtering, and quest card interactions.
 */
export class QuestHubPage extends BasePage {
  constructor(page) {
    super(page);

    this.selectors = {
      // Hero section
      heroTitle: 'h1:has-text("Discover Your Next Adventure")',
      searchInput: 'input[placeholder*="Search quests"]',

      // Topic filters
      topicButton: (topic) => `button:has-text("${topic}")`,
      clearFiltersButton: 'text=Clear filters',

      // Quest cards
      questCard: '.grid > div',
      questCardTitle: 'h3, .font-bold',
      questCardLink: 'a[href*="/quests/"]',

      // Action buttons
      createQuestButton: 'button:has-text("Create Quest")',

      // Loading and empty states
      loadingSpinner: '.animate-spin',
      emptyState: 'text=No quests found',
      questCount: 'text=/\\d+ quests/',

      // Create quest modal
      createQuestModal: '[role="dialog"], .modal',
    };
  }

  /**
   * Navigate to quest discovery page
   */
  async goto() {
    await super.goto('/quests');
    await this.waitForLoadingComplete();
  }

  /**
   * Search for quests
   */
  async search(query) {
    await this.fill(this.selectors.searchInput, query);
    // Wait for debounced search
    await this.page.waitForTimeout(600);
    await this.waitForLoadingComplete();
  }

  /**
   * Clear search input
   */
  async clearSearch() {
    await this.fill(this.selectors.searchInput, '');
    await this.page.waitForTimeout(600);
    await this.waitForLoadingComplete();
  }

  /**
   * Click a topic filter
   */
  async selectTopic(topicName) {
    await this.click(this.selectors.topicButton(topicName));
    await this.waitForLoadingComplete();
  }

  /**
   * Clear all filters
   */
  async clearFilters() {
    if (await this.isVisible(this.selectors.clearFiltersButton, 2000)) {
      await this.click(this.selectors.clearFiltersButton);
      await this.waitForLoadingComplete();
    }
  }

  /**
   * Get number of visible quest cards
   */
  async getQuestCount() {
    await this.waitForLoadingComplete();
    const cards = await this.page.$$(this.selectors.questCard);
    return cards.length;
  }

  /**
   * Get quest count from UI text
   */
  async getDisplayedQuestCount() {
    try {
      const countText = await this.getText('.text-gray-600:has-text("quests")');
      const match = countText.match(/(\d+)/);
      return match ? parseInt(match[1]) : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Click on a quest card by index
   */
  async clickQuestByIndex(index = 0) {
    await this.waitForLoadingComplete();
    const cards = await this.page.$$(this.selectors.questCard);
    if (cards.length > index) {
      await cards[index].click();
      await this.waitForUrl('/quests/');
    }
  }

  /**
   * Click on a quest card by title
   */
  async clickQuestByTitle(title) {
    await this.waitForLoadingComplete();
    await this.click(`text="${title}"`);
    await this.waitForUrl('/quests/');
  }

  /**
   * Check if a quest with specific title exists
   */
  async hasQuestWithTitle(title) {
    return this.isVisible(`text="${title}"`, 3000);
  }

  /**
   * Get all visible quest titles
   */
  async getQuestTitles() {
    await this.waitForLoadingComplete();
    const cards = await this.page.$$('.grid > div');
    const titles = [];
    for (const card of cards) {
      const titleEl = await card.$('h3, .font-bold');
      if (titleEl) {
        const text = await titleEl.textContent();
        if (text) titles.push(text.trim());
      }
    }
    return titles;
  }

  /**
   * Check if page is loaded
   */
  async isLoaded() {
    return this.isVisible(this.selectors.heroTitle, 5000);
  }

  /**
   * Check if empty state is shown
   */
  async hasEmptyState() {
    return this.isVisible(this.selectors.emptyState, 2000);
  }

  /**
   * Check if loading
   */
  async isLoading() {
    return this.isVisible(this.selectors.loadingSpinner, 1000);
  }

  /**
   * Click create quest button (requires auth)
   */
  async clickCreateQuest() {
    await this.click(this.selectors.createQuestButton);
    await this.waitForElement(this.selectors.createQuestModal);
  }

  /**
   * Check if create quest button is visible
   */
  async hasCreateQuestButton() {
    return this.isVisible(this.selectors.createQuestButton, 2000);
  }

  /**
   * Get first quest card's details
   */
  async getFirstQuestDetails() {
    await this.waitForLoadingComplete();
    const card = await this.page.$(this.selectors.questCard);
    if (!card) return null;

    const title = await card.$eval('h3, .font-bold', el => el.textContent?.trim()).catch(() => '');
    const description = await card.$eval('p', el => el.textContent?.trim()).catch(() => '');

    return { title, description };
  }

  /**
   * Wait for quests to load
   */
  async waitForQuestsToLoad() {
    await this.waitForLoadingComplete();
    // Wait for either quest cards or empty state
    await Promise.race([
      this.waitForElement(this.selectors.questCard, { timeout: 10000 }),
      this.waitForElement('text=No quests found', { timeout: 10000 })
    ]).catch(() => {});
  }
}
