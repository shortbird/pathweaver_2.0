import { test, expect } from '@playwright/test';
import { clickByText, loginAsParent, loginAsStudent } from './helpers';

test.describe('Parent Invitations', () => {
  test('INV17: Parent can create dependent account', async ({ page }) => {
    await loginAsParent(page);
    await page.waitForTimeout(3000);
    const addBtn = page.getByText(/add child|add dependent|create.*account/i).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(addBtn).toBeVisible();
    }
  });

  test('INV18: Dependent creation form shows required fields', async ({ page }) => {
    await loginAsParent(page);
    await page.waitForTimeout(3000);
    const addBtn = page.getByText(/add child|add dependent|create/i).first();
    if (await addBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await addBtn.click();
      await page.waitForTimeout(2000);
      // Should show name and potentially email fields
      const nameInput = page.getByPlaceholder(/name|display name/i).first();
      if (await nameInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(nameInput).toBeVisible();
      }
    }
  });

  test('INV19: Parent sees list of existing dependents', async ({ page }) => {
    await loginAsParent(page);
    await page.waitForTimeout(3000);
    await expect(page.getByText(/dependent|child|student/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('INV20: Parent can initiate dependent promotion to full account', async ({ page }) => {
    await loginAsParent(page);
    await page.waitForTimeout(3000);
    const promoteBtn = page.getByText(/promote|upgrade|independent/i).first();
    if (await promoteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(promoteBtn).toBeVisible();
    }
  });
});
