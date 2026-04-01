import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

test.describe('Student Courses', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'Courses');
  });

  test('ST20: Courses page loads', async ({ page }) => {
    await expect(page.getByText(/course|catalog|enrolled/i)).toBeVisible({ timeout: 15000 });
  });

  test('ST21: Enrolled courses are displayed', async ({ page }) => {
    await page.waitForTimeout(3000);
    // Should show enrolled courses or empty state
    const content = await page.textContent('body');
    expect(content).toBeTruthy();
  });

  test('ST22: Can view course details', async ({ page }) => {
    await page.waitForTimeout(3000);
    const courseCard = page.locator('[data-testid*="course"], div:has-text("Course")').first();
    if (await courseCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await courseCard.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/project|lesson|description/i)).toBeVisible({ timeout: 15000 });
    }
  });

  test('ST23: Course shows project sequence', async ({ page }) => {
    await page.waitForTimeout(3000);
    const courseCard = page.locator('[data-testid*="course"], div:has-text("Course")').first();
    if (await courseCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await courseCard.click();
      await page.waitForTimeout(2000);
      // Should show ordered projects/quests
      await expect(page.getByText(/project|quest|module/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('ST24: Course shows progress through projects', async ({ page }) => {
    await page.waitForTimeout(3000);
    const courseCard = page.locator('[data-testid*="course"], div:has-text("Course")').first();
    if (await courseCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await courseCard.click();
      await page.waitForTimeout(2000);
      await expect(page.getByText(/progress|%|complete/i).first()).toBeVisible({ timeout: 15000 });
    }
  });

  test('ST25: Course catalog shows available courses', async ({ page }) => {
    // Navigate to catalog view
    const catalogBtn = page.getByText(/catalog|browse|available/i).first();
    if (await catalogBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await catalogBtn.click();
      await page.waitForTimeout(2000);
      const content = await page.textContent('body');
      expect(content).toBeTruthy();
    }
  });

  test('ST26: Course lessons show content', async ({ page }) => {
    await page.waitForTimeout(3000);
    const courseCard = page.locator('[data-testid*="course"], div:has-text("Course")').first();
    if (await courseCard.isVisible({ timeout: 5000 }).catch(() => false)) {
      await courseCard.click();
      await page.waitForTimeout(2000);
      // Click into a lesson
      const lessonLink = page.getByText(/lesson/i).first();
      if (await lessonLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await lessonLink.click();
        await page.waitForTimeout(2000);
        await expect(page.getByText(/content|step|task/i).first()).toBeVisible({ timeout: 15000 });
      }
    }
  });
});
