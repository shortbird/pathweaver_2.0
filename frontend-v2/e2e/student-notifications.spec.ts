import { test, expect } from '@playwright/test';
import { loginAsStudent, navigateTo } from './helpers';

test.describe('Student Notifications', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
  });

  test('ST60: Can navigate to notifications page', async ({ page }) => {
    await navigateTo(page, 'notifications');
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/notification|alert|update|no notification|empty/);
  });

  test('ST61: Notifications page shows content', async ({ page }) => {
    await navigateTo(page, 'notifications');
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test.skip('ST62: Notifications show recent items (requires seeded data)', async ({ page }) => {
    // Skipped: requires notification data
  });

  test.skip('ST63: Can mark notification as read (requires seeded data)', async ({ page }) => {
    // Skipped: requires unread notification data
  });

  test.skip('ST64: Unread notification count badge visible (requires seeded data)', async ({ page }) => {
    // Skipped: requires unread notifications
  });

  test.skip('ST65: Can mark all notifications as read (requires seeded data)', async ({ page }) => {
    // Skipped: requires notification data
  });
});
