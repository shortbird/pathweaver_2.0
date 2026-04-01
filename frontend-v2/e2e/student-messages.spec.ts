import { test, expect } from '@playwright/test';
import { loginAsStudent, navigateTo } from './helpers';

test.describe('Student Messages', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'messages');
  });

  test('ST58: Messages page loads', async ({ page }) => {
    await expect(page.getByText(/Message|Inbox|Conversation/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST59: Messages shows conversation list or empty state', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/message|conversation|inbox|no message|empty/);
  });
});
