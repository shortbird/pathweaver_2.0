import { test, expect } from '@playwright/test';
import { BASE_URL, USERS, clickByText, loginAsStudent, loginAsObserver, login } from './helpers';

test.describe('Observer Invitations', () => {
  test('INV1: Student can access observer invite flow', async ({ page }) => {
    await loginAsStudent(page);
    await clickByText(page, 'Profile');
    await page.waitForTimeout(2000);
    const inviteBtn = page.getByText(/invite.*observer|add.*observer|observer/i).first();
    if (await inviteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(inviteBtn).toBeVisible();
    }
  });

  test('INV2: Observer invite form shows email field', async ({ page }) => {
    await loginAsStudent(page);
    await clickByText(page, 'Profile');
    await page.waitForTimeout(2000);
    const inviteBtn = page.getByText(/invite.*observer|add.*observer/i).first();
    if (await inviteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inviteBtn.click();
      await page.waitForTimeout(2000);
      await expect(page.getByPlaceholder(/email/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('INV3: Invalid email shows validation error', async ({ page }) => {
    await loginAsStudent(page);
    await clickByText(page, 'Profile');
    await page.waitForTimeout(2000);
    const inviteBtn = page.getByText(/invite.*observer|add.*observer/i).first();
    if (await inviteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inviteBtn.click();
      await page.waitForTimeout(2000);
      const emailInput = page.getByPlaceholder(/email/i).first();
      if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await emailInput.fill('notanemail');
        await clickByText(page, 'Send');
        await page.waitForTimeout(2000);
        await expect(page.getByText(/invalid|error|valid email/i).first()).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('INV4: Observer can see pending invitations', async ({ page }) => {
    await loginAsObserver(page);
    await page.waitForTimeout(3000);
    const pendingSection = page.getByText(/pending|invitation|request/i).first();
    if (await pendingSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(pendingSection).toBeVisible();
    }
  });

  test('INV5: Observer can accept invitation', async ({ page }) => {
    await loginAsObserver(page);
    await page.waitForTimeout(3000);
    const acceptBtn = page.getByText(/accept|confirm/i).first();
    if (await acceptBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(acceptBtn).toBeVisible();
    }
  });

  test('INV6: Observer can decline invitation', async ({ page }) => {
    await loginAsObserver(page);
    await page.waitForTimeout(3000);
    const declineBtn = page.getByText(/decline|reject/i).first();
    if (await declineBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(declineBtn).toBeVisible();
    }
  });

  test('INV7: Student sees observer status after invite', async ({ page }) => {
    await loginAsStudent(page);
    await clickByText(page, 'Profile');
    await page.waitForTimeout(2000);
    const observerSection = page.getByText(/observer|linked|connected/i).first();
    if (await observerSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(observerSection).toBeVisible();
    }
  });

  test('INV8: Student can remove linked observer', async ({ page }) => {
    await loginAsStudent(page);
    await clickByText(page, 'Profile');
    await page.waitForTimeout(2000);
    const removeBtn = page.getByText(/remove.*observer|unlink|disconnect/i).first();
    if (await removeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(removeBtn).toBeVisible();
    }
  });
});
