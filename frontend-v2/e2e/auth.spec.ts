import { test, expect } from '@playwright/test';
import { BASE_URL, USERS, clickByText, login, loginAsStudent, loginAsParent, loginAsAdvisor, loginAsObserver, loginAsSuperadmin, loginAsOrgAdmin } from './helpers';

test.describe('Auth Suite', () => {
  test('A1: Login with valid student credentials', async ({ page }) => {
    await loginAsStudent(page);
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 20000 });
  });

  test('A2: Login with valid parent credentials', async ({ page }) => {
    await loginAsParent(page);
    // Parent should see family-related content
    await expect(page.getByText(/family|dependent|child/i)).toBeVisible({ timeout: 15000 });
  });

  test('A3: Login with valid advisor credentials', async ({ page }) => {
    await loginAsAdvisor(page);
    await expect(page.getByText(/advisor|students|dashboard/i)).toBeVisible({ timeout: 15000 });
  });

  test('A4: Login with valid observer credentials', async ({ page }) => {
    await loginAsObserver(page);
    await expect(page.getByText(/observer|portfolio|students/i)).toBeVisible({ timeout: 15000 });
  });

  test('A5: Login with valid superadmin credentials', async ({ page }) => {
    await loginAsSuperadmin(page);
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 20000 });
  });

  test('A6: Login with valid org admin credentials', async ({ page }) => {
    await loginAsOrgAdmin(page);
    await expect(page.getByText(/organization|admin|manage/i)).toBeVisible({ timeout: 15000 });
  });

  test('A7: Login with invalid email shows error', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill('nonexistent@test.com');
    await page.getByPlaceholder('Enter password').fill('password123');
    await clickByText(page, 'Sign In');
    await expect(page.getByText(/invalid|error|incorrect|not found/i)).toBeVisible({ timeout: 15000 });
  });

  test('A8: Login with wrong password shows error', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill(USERS.student.email);
    await page.getByPlaceholder('Enter password').fill('definitelywrongpassword');
    await clickByText(page, 'Sign In');
    await expect(page.getByText(/invalid|error|incorrect/i)).toBeVisible({ timeout: 15000 });
  });

  test('A9: Login with empty fields shows validation', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(2000);
    // Should either show validation errors or remain on login page
    await expect(page.getByPlaceholder('you@email.com')).toBeVisible();
  });

  test('A10: Logout returns to login page', async ({ page }) => {
    await loginAsStudent(page);
    // Navigate to profile where logout typically lives
    await clickByText(page, 'Profile');
    await page.waitForTimeout(2000);
    // Look for sign out / logout button
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText(/welcome|sign in|log in/i)).toBeVisible({ timeout: 15000 });
  });

  test('A11: Session persists on page refresh', async ({ page }) => {
    await loginAsStudent(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    // Should still be on dashboard, not redirected to login
    await expect(page.getByText(/welcome back|total xp|dashboard/i)).toBeVisible({ timeout: 20000 });
  });

  test('A12: Protected route redirects unauthenticated user to login', async ({ page }) => {
    await page.goto(`${BASE_URL}/quests`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    // Should be redirected to login
    await expect(page.getByText(/welcome|sign in/i)).toBeVisible({ timeout: 15000 });
  });
});
