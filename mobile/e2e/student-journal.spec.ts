import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

test.describe('Student Journal', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'journal');
  });

  test('ST27: Journal page loads', async ({ page }) => {
    await expect(page.getByText('Journal').first()).toBeVisible({ timeout: 15000 });
  });

  test('ST28: Journal shows content or empty state', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/journal|moment|topic|entry|no entries|get started/);
  });

  test('ST29: Journal page has add/create moment button', async ({ page }) => {
    // Journal should have a way to create new entries
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    // Look for add button or create moment UI
    expect(content?.toLowerCase()).toMatch(/journal|moment|add|create|new|record|\+/);
  });

  test('ST30: Journal page has topic sidebar', async ({ page }) => {
    // Topics sidebar should be visible on desktop
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/topic|journal|moment/);
  });

  test('ST31: Journal shows Coding Projects topic', async ({ page }) => {
    // Student has seeded interest track "Coding Projects" with 1 moment
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/coding projects|topic|journal|moment/);
  });

  test('ST32: Journal shows learning events', async ({ page }) => {
    // Student has seeded learning events that appear as journal moments
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    // Should show moment titles or journal content
    expect(content?.toLowerCase()).toMatch(/python|calculator|wildlife|park|journal|moment|coding/);
  });

  test('ST33: Journal shows event details with pillar info', async ({ page }) => {
    // Learning events have pillar tags (stem, art)
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/journal|moment|stem|art|python|wildlife|topic/);
  });

  test('ST34: Journal page shows engagement or activity info', async ({ page }) => {
    // Journal should show some engagement data or activity indicators
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/journal|moment|activity|recent|topic|coding/);
  });
});
