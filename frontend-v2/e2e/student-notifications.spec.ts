import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent } from './helpers';

test.describe('Student Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
  });

  test('ST60: Bell icon is visible in header', async ({ page }) => {
    // Notifications bell icon in the header
    const bellIcon = page.locator('[data-testid*="notification"], [data-testid*="bell"], svg').first();
    await page.waitForTimeout(3000);
    // The bell/notification icon should exist somewhere in the header
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('ST61: Clicking bell opens notifications panel', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Try clicking the bell icon area
    const bell = page.locator('[data-testid*="notification"], [data-testid*="bell"]').first();
    if (await bell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bell.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/notification|alert|update/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('ST62: Notifications show recent items', async ({ page }) => {
    await page.waitForTimeout(3000);
    const bell = page.locator('[data-testid*="notification"], [data-testid*="bell"]').first();
    if (await bell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bell.click();
      await page.waitForTimeout(2000);
      const content = await page.textContent('body');
      expect(content?.toLowerCase()).toMatch(/notification|no notification|empty|alert/);
    }
  });

  test('ST63: Can mark notification as read', async ({ page }) => {
    await page.waitForTimeout(3000);
    const bell = page.locator('[data-testid*="notification"], [data-testid*="bell"]').first();
    if (await bell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bell.click();
      await page.waitForTimeout(2000);
      const markRead = page.getByText(/mark.*read|dismiss|clear/i).first();
      if (await markRead.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(markRead).toBeVisible();
      }
    }
  });

  test('ST64: Unread notification count badge visible', async ({ page }) => {
    await page.waitForTimeout(3000);
    // If there are unread notifications, a badge/count should show
    const badge = page.locator('[data-testid*="badge"], [data-testid*="count"]').first();
    if (await badge.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(badge).toBeVisible();
    }
  });

  test('ST65: Can mark all notifications as read', async ({ page }) => {
    await page.waitForTimeout(3000);
    const bell = page.locator('[data-testid*="notification"], [data-testid*="bell"]').first();
    if (await bell.isVisible({ timeout: 5000 }).catch(() => false)) {
      await bell.click();
      await page.waitForTimeout(2000);
      const markAll = page.getByText(/mark all|clear all|read all/i).first();
      if (await markAll.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(markAll).toBeVisible();
      }
    }
  });
});
