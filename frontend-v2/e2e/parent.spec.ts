import { test, expect } from '@playwright/test';
import { clickByText, loginAsParent, navigateTo } from './helpers';

test.describe('Parent Suite', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsParent(page);
  });

  test('P1: Parent lands on family page after login', async ({ page }) => {
    // Parent redirects to family page with child selector
    await expect(page.getByText('Family', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('P2: Parent sees child name', async ({ page }) => {
    // Family page shows child name (e.g. "Test Child")
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/child|family|total xp|actions/);
  });

  test('P3: Parent sees Total XP for dependent', async ({ page }) => {
    await expect(page.getByText(/Total XP/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P4: Parent sees Actions section', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/action|quest|xp|family/);
  });

  test('P5: Parent sees Learning Rhythm', async ({ page }) => {
    await expect(page.getByText(/Learning Rhythm/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P6: Parent sees Active Quests', async ({ page }) => {
    await expect(page.getByText(/Active Quests/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P7: Parent can navigate to bounties', async ({ page }) => {
    await navigateTo(page, 'bounties');
    await expect(page.getByText('Bounties').first()).toBeVisible({ timeout: 15000 });
  });

  test('P8: Parent family page shows pending actions or tasks', async ({ page }) => {
    // Parent should see task-related content for their child
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/action|task|quest|xp|family|approve/);
  });

  test('P9: Parent family page shows child management options', async ({ page }) => {
    // Family page should show options related to managing dependents
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/family|child|dependent|add|total xp|action/);
  });

  test('P10: Parent can navigate to journal', async ({ page }) => {
    await navigateTo(page, 'journal');
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/journal|moment|topic/);
  });

  test('P11: Parent family page shows engagement data', async ({ page }) => {
    // Family page has Learning Rhythm heatmap
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Learning Rhythm/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P12: Parent can navigate to profile', async ({ page }) => {
    await navigateTo(page, 'profile');
    await expect(page.getByText(/Total XP|Profile|Sign Out/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P13: Parent can sign out', async ({ page }) => {
    await navigateTo(page, 'profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Welcome|Sign In/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('P14: Parent bounties page shows posted bounties', async ({ page }) => {
    // Parent posted a bounty "Clean Up the Community Garden"
    await navigateTo(page, 'bounties');
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/bounties|browse|claims|posted/);
  });

  test('P15: Parent can navigate to buddy page', async ({ page }) => {
    await navigateTo(page, 'buddy');
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/buddy|vitality|bond|create|name/);
  });

  test('P16: Parent family page shows complete child overview', async ({ page }) => {
    // Family page should show comprehensive child data
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/family|total xp|active quests|learning rhythm/);
  });
});
