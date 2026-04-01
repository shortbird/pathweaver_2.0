import { test, expect } from '@playwright/test';
import { loginAsStudent, navigateTo } from './helpers';

test.describe('Student Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
  });

  test('ST1: Dashboard shows total XP', async ({ page }) => {
    await expect(page.getByText('Total XP')).toBeVisible({ timeout: 15000 });
  });

  test('ST2: Dashboard shows active quests count', async ({ page }) => {
    await expect(page.getByText('Active Quests')).toBeVisible({ timeout: 15000 });
  });

  test('ST3: Dashboard shows welcome message', async ({ page }) => {
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 15000 });
  });

  test('ST4: Dashboard shows learning rhythm', async ({ page }) => {
    await expect(page.getByText(/Learning Rhythm/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST5: Dashboard shows completed quests', async ({ page }) => {
    await expect(page.getByText('Completed Quests')).toBeVisible({ timeout: 15000 });
  });

  test('ST6: Dashboard sidebar navigation is visible', async ({ page }) => {
    await expect(page.getByText('Quests').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Journal').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Buddy').first()).toBeVisible({ timeout: 15000 });
  });

  test('ST7: Dashboard shows current quests section', async ({ page }) => {
    await expect(page.getByText('Current Quests')).toBeVisible({ timeout: 15000 });
  });

  test('ST8: Dashboard can navigate to quests', async ({ page }) => {
    await navigateTo(page, 'quests');
    await expect(page.getByText(/Quest|Discover|Browse/i).first()).toBeVisible({ timeout: 15000 });
  });
});
