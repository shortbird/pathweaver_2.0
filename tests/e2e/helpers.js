/**
 * E2E Test Helpers
 *
 * Shared utility functions for Playwright tests
 * Includes WebKit-specific fixes for robust testing
 */

const BASE_URL = 'https://optio-dev-frontend.onrender.com';

/**
 * Login helper with robust wait strategy
 * Works reliably across Chromium, Firefox, and WebKit
 */
export async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', 'test@optioeducation.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');

  // Test user is a student, redirects to /dashboard
  await page.waitForURL(/.*\/dashboard/, { timeout: 20000 });

  // Extra wait for dashboard to fully load (WebKit fix)
  await page.waitForLoadState('domcontentloaded');
}

/**
 * Navigate to quest hub and wait for quest data to load
 * WebKit-optimized: Waits for API response instead of just networkidle
 */
export async function navigateToQuestHub(page) {
  // Set up response listener BEFORE navigation
  const questApiResponsePromise = page.waitForResponse(
    response => response.url().includes('/api/quests') && response.status() === 200,
    { timeout: 20000 }
  );

  await page.goto(`${BASE_URL}/quest-hub`);

  // Wait for quest API to respond successfully
  await questApiResponsePromise;

  // Wait for DOM to settle
  await page.waitForLoadState('domcontentloaded');

  // Extra wait for React to render (WebKit needs this)
  await page.waitForTimeout(1000);
}

/**
 * Wait for quest cards to appear on the page
 * WebKit-optimized: Waits for elements to exist AND be visible
 */
export async function waitForQuestCards(page, options = {}) {
  const {
    timeout = 20000,
    minCount = 1,
    selector = '.bg-white.rounded-xl.cursor-pointer'
  } = options;

  // First, wait for at least one card to exist in DOM
  await page.waitForSelector(selector, {
    state: 'attached',
    timeout: timeout
  });

  // Then wait for cards to be visible (may need layout/paint)
  await page.waitForFunction(
    (sel) => {
      const cards = document.querySelectorAll(sel);
      return cards.length > 0 && cards[0].offsetHeight > 0;
    },
    selector,
    { timeout: timeout }
  );

  // Return the locator for further use
  return page.locator(selector);
}

/**
 * Click QUESTS tab if it exists (some views may not have tabs)
 * Returns true if tab was clicked, false if not found
 */
export async function clickQuestsTab(page) {
  const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
  const isVisible = await questsTab.isVisible({ timeout: 5000 }).catch(() => false);

  if (isVisible) {
    await questsTab.click();
    // Wait for tab animation to complete
    await page.waitForTimeout(1500);
    return true;
  }

  return false;
}

/**
 * Navigate to quest hub and ensure quest cards are loaded
 * Combined helper for common test setup
 */
export async function setupQuestHub(page) {
  await navigateToQuestHub(page);
  await clickQuestsTab(page);
  await waitForQuestCards(page);
}

/**
 * Find an enrolled quest by checking for "SET DOWN QUEST" button
 * Returns quest card element or null
 */
export async function findEnrolledQuest(page, maxAttempts = 5) {
  const questCards = await waitForQuestCards(page);
  const cardCount = await questCards.count();

  for (let i = 0; i < Math.min(cardCount, maxAttempts); i++) {
    await questCards.nth(i).click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    const setDownButton = page.getByRole('button', { name: /SET DOWN QUEST/i });
    const isVisible = await setDownButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (isVisible) {
      return { found: true, index: i };
    }

    // Go back and try next quest
    await page.goto(`${BASE_URL}/quest-hub`);
    await waitForQuestCards(page);
  }

  return { found: false, index: -1 };
}

/**
 * Find an unenrolled quest by checking for "Pick Up Quest" button
 * Returns quest card element or null
 */
export async function findUnenrolledQuest(page, maxAttempts = 5) {
  const questCards = await waitForQuestCards(page);
  const cardCount = await questCards.count();

  for (let i = 0; i < Math.min(cardCount, maxAttempts); i++) {
    await questCards.nth(i).click();
    await page.waitForURL(/.*\/quests\/[a-f0-9-]{36}/, { timeout: 10000 });

    const pickUpButton = page.getByRole('button', { name: /Pick Up Quest/i });
    const isVisible = await pickUpButton.isVisible({ timeout: 3000 }).catch(() => false);

    if (isVisible) {
      return { found: true, index: i };
    }

    // Go back and try next quest
    await page.goto(`${BASE_URL}/quest-hub`);
    await waitForQuestCards(page);
  }

  return { found: false, index: -1 };
}

export { BASE_URL };
