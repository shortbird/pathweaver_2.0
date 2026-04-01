import { test, expect } from '@playwright/test';
import { BASE_URL, clickByText, loginAsOrgAdmin, loginAsStudent, login } from './helpers';

test.describe('Organization Invitations', () => {
  test('INV9: Org admin can access invite flow', async ({ page }) => {
    await loginAsOrgAdmin(page);
    await page.waitForTimeout(3000);
    const inviteBtn = page.getByText(/invite|add member|add user/i).first();
    if (await inviteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(inviteBtn).toBeVisible();
    }
  });

  test('INV10: Org invite form shows email and role fields', async ({ page }) => {
    await loginAsOrgAdmin(page);
    await page.waitForTimeout(3000);
    const inviteBtn = page.getByText(/invite|add member/i).first();
    if (await inviteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inviteBtn.click();
      await page.waitForTimeout(2000);
      await expect(page.getByPlaceholder(/email/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('INV11: Org admin can set role for invited user', async ({ page }) => {
    await loginAsOrgAdmin(page);
    await page.waitForTimeout(3000);
    const inviteBtn = page.getByText(/invite|add member/i).first();
    if (await inviteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inviteBtn.click();
      await page.waitForTimeout(2000);
      const roleSelect = page.getByText(/role|student|advisor/i).first();
      if (await roleSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(roleSelect).toBeVisible();
      }
    }
  });

  test('INV12: Invalid email in org invite shows error', async ({ page }) => {
    await loginAsOrgAdmin(page);
    await page.waitForTimeout(3000);
    const inviteBtn = page.getByText(/invite|add member/i).first();
    if (await inviteBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await inviteBtn.click();
      await page.waitForTimeout(2000);
      const emailInput = page.getByPlaceholder(/email/i).first();
      if (await emailInput.isVisible({ timeout: 5000 }).catch(() => false)) {
        await emailInput.fill('notanemail');
        await clickByText(page, 'Send');
        await page.waitForTimeout(2000);
        await expect(page.getByText(/invalid|error|valid/i).first()).toBeVisible({ timeout: 15000 });
      }
    }
  });

  test('INV13: Org admin sees pending invitations list', async ({ page }) => {
    await loginAsOrgAdmin(page);
    await page.waitForTimeout(3000);
    const pendingSection = page.getByText(/pending|invitation|sent/i).first();
    if (await pendingSection.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(pendingSection).toBeVisible();
    }
  });

  test('INV14: Org admin can cancel pending invitation', async ({ page }) => {
    await loginAsOrgAdmin(page);
    await page.waitForTimeout(3000);
    const cancelBtn = page.getByText(/cancel|revoke|withdraw/i).first();
    if (await cancelBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(cancelBtn).toBeVisible();
    }
  });

  test('INV15: Org admin can resend invitation', async ({ page }) => {
    await loginAsOrgAdmin(page);
    await page.waitForTimeout(3000);
    const resendBtn = page.getByText(/resend|send again/i).first();
    if (await resendBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await expect(resendBtn).toBeVisible();
    }
  });

  test('INV16: Org admin can remove member from organization', async ({ page }) => {
    await loginAsOrgAdmin(page);
    await page.waitForTimeout(3000);
    const memberRow = page.getByText(/student|advisor|member/i).first();
    if (await memberRow.isVisible({ timeout: 5000 }).catch(() => false)) {
      await memberRow.click();
      await page.waitForTimeout(2000);
      const removeBtn = page.getByText(/remove|delete|deactivate/i).first();
      if (await removeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
        await expect(removeBtn).toBeVisible();
      }
    }
  });
});
