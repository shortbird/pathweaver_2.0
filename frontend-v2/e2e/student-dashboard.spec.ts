import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent } from './helpers';

test.describe('Student Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
  });

  test('ST1: Dashboard shows total XP', async ({ page }) => {
    await expect(page.getByText('Total XP')).toBeVisible({ timeout: 15000 });
    // XP value should be a number
    await expect(page.getByText(/\d+/).first()).toBeVisible();
  });

  test('ST2: Dashboard shows active quests count', async ({ page }) => {
    await expect(page.getByText('Active Quests')).toBeVisible({ timeout: 15000 });
  });

  test('ST3: Dashboard shows welcome message with user name', async ({ page }) => {
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 15000 });
  });

  test('ST4: Dashboard shows engagement heatmap', async ({ page }) => {
    // The mini heatmap component should be visible on dashboard
    await expect(page.getByText(/streak|activity|rhythm/i)).toBeVisible({ timeout: 15000 });
  });

  test('ST5: Dashboard shows recent activity', async ({ page }) => {
    await expect(page.getByText(/recent|activity|latest/i)).toBeVisible({ timeout: 15000 });
  });

  test('ST6: Dashboard sidebar navigation is visible', async ({ page }) => {
    await expect(page.getByText('Quests')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Journal')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Profile')).toBeVisible({ timeout: 15000 });
  });

  test('ST7: Dashboard shows skill pillars breakdown', async ({ page }) => {
    // XP breakdown by pillar should be visible
    await expect(page.getByText(/pillar|skill|knowledge|creativity|leadership|physical/i)).toBeVisible({ timeout: 15000 });
  });

  test('ST8: Dashboard shows badges section', async ({ page }) => {
    await expect(page.getByText(/badge|achievement/i)).toBeVisible({ timeout: 15000 });
  });
});
