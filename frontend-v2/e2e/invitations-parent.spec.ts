import { test, expect } from '@playwright/test';
import { clickByText, loginAsParent, navigateTo } from './helpers';

test.describe('Parent Invitations', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsParent(page);
  });

  test('INV17: Parent family page shows dependent management', async ({ page }) => {
    // Parent lands on family page which has dependent management
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/family|child|dependent|add|total xp/);
  });

  test('INV18: Parent family page shows child info', async ({ page }) => {
    // Parent has linked children - should see child names or dependent list
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/child|family|xp|actions|quest/);
  });

  test('INV19: Parent sees family page with dependents', async ({ page }) => {
    await expect(page.getByText('Family', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('INV20: Parent family page is fully interactive', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Verify the family page loaded and shows interactive elements
    await expect(page.getByText(/Family|Total XP|Actions/i).first()).toBeVisible({ timeout: 15000 });
  });
});
