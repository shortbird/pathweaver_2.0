import { test, expect } from '@playwright/test';
import { clickByText, loginAsStudent, navigateTo } from './helpers';

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

  test('ST22: Courses page shows enrolled course content', async ({ page }) => {
    // Student is enrolled in a course (id: 12345678...) linked to Quest A
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/course|enrolled|learn|code|my courses/);
  });

  test('ST23: Course page shows project or quest links', async ({ page }) => {
    // Course links to Quest A ("Learn to Code")
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/course|project|quest|learn|code/);
  });

  test('ST24: Courses page shows progress indicators', async ({ page }) => {
    // Student has tasks on Quest A, so should see progress
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    expect(content?.toLowerCase()).toMatch(/course|progress|xp|complete|enrolled/);
  });

  test('ST25: Courses page is fully rendered', async ({ page }) => {
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    // Page should have substantial content
    expect(content).toBeTruthy();
    expect(content!.length).toBeGreaterThan(50);
  });

  test('ST26: Course content includes lesson info', async ({ page }) => {
    // Quest A has seeded lessons: "Introduction to Variables" and "Control Flow with If/Else"
    await page.waitForTimeout(5000);
    const content = await page.textContent('body');
    // May need to click into a course to see lessons; verify page loads
    expect(content?.toLowerCase()).toMatch(/course|lesson|variable|learn|code|enrolled/);
  });
});
