import { test, expect } from '@playwright/test';
import { loginAsStudent, navigateTo } from './helpers';

test.describe('Student Courses', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'courses');
  });

  test('ST20: Courses page loads', async ({ page }) => {
    await expect(page.getByText(/Course|My Courses|Enrolled/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('ST21: Courses page shows enrolled courses or empty state', async ({ page }) => {
    await page.waitForTimeout(3000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/course|enrolled|no course|empty/);
  });

  test.skip('ST22: Can view course details (requires seeded data)', async ({ page }) => {
    // Skipped: requires enrolled course data
  });

  test.skip('ST23: Course shows project sequence (requires seeded data)', async ({ page }) => {
    // Skipped: requires enrolled course with projects
  });

  test.skip('ST24: Course shows progress through projects (requires seeded data)', async ({ page }) => {
    // Skipped: requires enrolled course with progress
  });

  test.skip('ST25: Course catalog shows available courses (requires seeded data)', async ({ page }) => {
    // Skipped: requires course catalog data
  });

  test.skip('ST26: Course lessons show content (requires seeded data)', async ({ page }) => {
    // Skipped: requires course with lessons
  });
});
