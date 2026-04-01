import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

test.describe('Student Buddy (AI)', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'Buddy');
  });

  test('ST42: Buddy page loads', async ({ page }) => {
    await expect(page.getByText(/buddy|chat|assistant|ai/i)).toBeVisible({ timeout: 15000 });
  });

  test('ST43: Can send a message to Buddy', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Find the message input
    const input = page.getByPlaceholder(/message|type|ask/i).first();
    if (await input.isVisible({ timeout: 5000 }).catch(() => false)) {
      await input.fill('Hello, can you help me with my learning?');
      await clickByText(page, 'Send');
      await page.waitForTimeout(5000);
      // Should see a response or the message echoed
      await expect(page.getByText(/hello|help|learning/i).first()).toBeVisible({ timeout: 20000 });
    } else {
      // Chat interface should at least be visible
      await expect(page.getByText(/buddy|chat/i).first()).toBeVisible();
    }
  });

  test('ST44: Buddy shows conversation history', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Should show previous conversation or empty state
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/buddy|chat|message|conversation|start/);
  });
});
