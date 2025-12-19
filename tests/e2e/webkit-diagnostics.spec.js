import { test, expect } from '@playwright/test';

/**
 * WebKit Diagnostic Tests
 *
 * Purpose: Identify why quest cards aren't rendering in WebKit
 * These tests add extensive logging and screenshots to diagnose the issue
 */

const BASE_URL = 'https://optio-dev-frontend.onrender.com';

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.fill('input[type="email"]', 'test@optioeducation.com');
  await page.fill('input[type="password"]', 'TestPassword123!');
  await page.click('button[type="submit"]');
  await page.waitForURL(/.*\/dashboard/, { timeout: 15000 });
}

test.describe('WebKit Diagnostics', () => {
  test('diagnose quest hub loading', async ({ page, browserName }) => {
    console.log(`\n=== Running on ${browserName} ===\n`);

    // Login
    console.log('Step 1: Logging in...');
    await login(page);
    console.log('  ✓ Login successful');

    // Navigate to quest hub
    console.log('Step 2: Navigating to quest hub...');
    await page.goto(`${BASE_URL}/quests`);
    console.log(`  ✓ Navigated to: ${page.url()}`);

    // Wait for network idle
    console.log('Step 3: Waiting for network idle...');
    await page.waitForLoadState('networkidle');
    console.log('  ✓ Network idle');

    // Take screenshot of initial page load
    await page.screenshot({ path: `test-results/webkit-diagnostic-01-initial-${browserName}.png`, fullPage: true });
    console.log('  ✓ Screenshot saved');

    // Check if QUESTS tab exists and is visible
    console.log('Step 4: Checking for QUESTS tab...');
    const questsTab = page.getByRole('button', { name: 'QUESTS', exact: true }).first();
    const isQuestsTabVisible = await questsTab.isVisible({ timeout: 5000 }).catch(() => false);
    console.log(`  QUESTS tab visible: ${isQuestsTabVisible}`);

    if (isQuestsTabVisible) {
      console.log('Step 5: Clicking QUESTS tab...');
      await questsTab.click();
      await page.waitForTimeout(2000); // Extra wait for tab animation
      console.log('  ✓ Tab clicked, waited 2s');

      // Take screenshot after tab click
      await page.screenshot({ path: `test-results/webkit-diagnostic-02-after-tab-${browserName}.png`, fullPage: true });
    }

    // Check page content
    console.log('Step 6: Checking page content...');
    const pageContent = await page.content();
    console.log(`  Page content length: ${pageContent.length} bytes`);

    // Check if "No quests found" message appears
    const noQuestsMessage = await page.locator('text=/No quests found/i').isVisible({ timeout: 1000 }).catch(() => false);
    console.log(`  "No quests found" message visible: ${noQuestsMessage}`);

    // Check if loading spinner appears
    const loadingSpinner = await page.locator('.animate-spin').isVisible({ timeout: 1000 }).catch(() => false);
    console.log(`  Loading spinner visible: ${loadingSpinner}`);

    // Check for error messages
    const errorMessage = await page.locator('.text-red-600, .bg-red-50').isVisible({ timeout: 1000 }).catch(() => false);
    console.log(`  Error message visible: ${errorMessage}`);
    if (errorMessage) {
      const errorText = await page.locator('.text-red-600, .bg-red-50').first().textContent();
      console.log(`  Error text: ${errorText}`);
    }

    // Check for quest cards with various selectors
    console.log('Step 7: Looking for quest cards with different selectors...');

    const selectors = [
      '.bg-white.rounded-xl.cursor-pointer',
      '.bg-white.rounded-xl',
      '.cursor-pointer',
      '[class*="bg-white"]',
      '[class*="rounded-xl"]',
      'div[class*="group"]',
    ];

    for (const selector of selectors) {
      const count = await page.locator(selector).count();
      const firstVisible = await page.locator(selector).first().isVisible({ timeout: 1000 }).catch(() => false);
      console.log(`  Selector "${selector}": ${count} elements, first visible: ${firstVisible}`);
    }

    // Check console logs for errors
    console.log('Step 8: Collecting browser console logs...');
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
    });

    // Wait a bit more and check again
    console.log('Step 9: Waiting additional 5 seconds...');
    await page.waitForTimeout(5000);

    const questCardsAfterWait = page.locator('.bg-white.rounded-xl.cursor-pointer');
    const countAfterWait = await questCardsAfterWait.count();
    const firstVisibleAfterWait = await questCardsAfterWait.first().isVisible({ timeout: 1000 }).catch(() => false);
    console.log(`  Quest cards after wait: ${countAfterWait} elements, first visible: ${firstVisibleAfterWait}`);

    // Take final screenshot
    await page.screenshot({ path: `test-results/webkit-diagnostic-03-final-${browserName}.png`, fullPage: true });

    // Check API response by listening to network
    console.log('Step 10: Checking network requests...');
    await page.goto(`${BASE_URL}/quest-hub`); // Reload to capture network

    const apiResponses = [];
    page.on('response', response => {
      if (response.url().includes('/api/quests')) {
        apiResponses.push({
          url: response.url(),
          status: response.status(),
          statusText: response.statusText()
        });
      }
    });

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3000);

    console.log('\nAPI Responses:');
    apiResponses.forEach(resp => {
      console.log(`  ${resp.status} ${resp.statusText} - ${resp.url}`);
    });

    console.log('\nBrowser Console Logs:');
    consoleLogs.forEach(log => console.log(`  ${log}`));

    console.log('\n=== Diagnostic complete ===\n');

    // This test is informational - don't assert, just gather data
    expect(true).toBe(true);
  });

  test('diagnose with request interception', async ({ page, browserName }) => {
    console.log(`\n=== Testing API requests on ${browserName} ===\n`);

    // Track all quest API calls
    const questApiCalls = [];

    page.on('request', request => {
      if (request.url().includes('/api/quests')) {
        console.log(`[REQUEST] ${request.method()} ${request.url()}`);
        console.log(`  Headers: ${JSON.stringify(request.headers())}`);
        questApiCalls.push({
          method: request.method(),
          url: request.url(),
          headers: request.headers()
        });
      }
    });

    page.on('response', async response => {
      if (response.url().includes('/api/quests')) {
        const status = response.status();
        console.log(`[RESPONSE] ${status} ${response.url()}`);

        if (status === 200) {
          try {
            const body = await response.json();
            console.log(`  Response body: ${JSON.stringify(body).substring(0, 200)}...`);
            console.log(`  Quest count: ${body.quests?.length || 0}`);
            console.log(`  Total: ${body.total || 0}`);
          } catch (e) {
            console.log(`  Could not parse JSON: ${e.message}`);
          }
        } else {
          console.log(`  ERROR STATUS: ${status}`);
          try {
            const text = await response.text();
            console.log(`  Error body: ${text.substring(0, 200)}`);
          } catch (e) {
            console.log(`  Could not read response body`);
          }
        }
      }
    });

    // Login and navigate
    await login(page);
    await page.goto(`${BASE_URL}/quests`);
    await page.waitForLoadState('networkidle');

    // Wait for quest API to be called
    await page.waitForTimeout(5000);

    console.log(`\nTotal quest API calls: ${questApiCalls.length}`);

    expect(true).toBe(true);
  });
});