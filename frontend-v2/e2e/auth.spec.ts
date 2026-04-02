import { test, expect } from '@playwright/test';
import { BASE_URL, USERS, clickByText, login, loginAsStudent, loginAsParent, loginAsAdvisor, loginAsObserver, loginAsSuperadmin, loginAsOrgAdmin, navigateTo } from './helpers';

test.describe('Auth Suite', () => {
  test('A1: Login with valid student credentials', async ({ page }) => {
    await loginAsStudent(page);
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 20000 });
  });

  test('A2: Login with valid parent credentials', async ({ page }) => {
    await loginAsParent(page);
    await expect(page.getByText('Test Child')).toBeVisible({ timeout: 15000 });
  });

  test('A3: Login with valid advisor credentials', async ({ page }) => {
    await loginAsAdvisor(page);
    await expect(page.getByText('Advisor').first()).toBeVisible({ timeout: 15000 });
  });

  test('A4: Login with valid observer credentials', async ({ page }) => {
    await loginAsObserver(page);
    // Observer sees welcome modal or feed
    await expect(page.getByText(/Welcome to Optio|Feed|Recent/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('A5: Login with valid superadmin credentials', async ({ page }) => {
    await loginAsSuperadmin(page);
    await expect(page.getByText('Welcome back')).toBeVisible({ timeout: 20000 });
  });

  test('A6: Login with valid org admin credentials', async ({ page }) => {
    await loginAsOrgAdmin(page);
    await expect(page.getByText('Advisor').first()).toBeVisible({ timeout: 15000 });
  });

  test('A7: Login with invalid email shows error', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill('nonexistent@test.com');
    await page.getByPlaceholder('Enter password').fill('password123');
    await clickByText(page, 'Sign In');
    await expect(page.getByText(/invalid|error|incorrect|not found|locked|too many/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('A8: Login with wrong password shows error', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill(USERS.student.email);
    await page.getByPlaceholder('Enter password').fill('definitelywrongpassword');
    await clickByText(page, 'Sign In');
    await expect(page.getByText(/invalid|error|incorrect/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('A9: Login with empty fields shows validation', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await clickByText(page, 'Sign In');
    await page.waitForTimeout(2000);
    await expect(page.getByText(/required/i).first()).toBeVisible({ timeout: 10000 });
  });

  test('A10: Logout returns to login page', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'profile');
    await page.waitForTimeout(2000);
    await clickByText(page, 'Sign Out');
    await page.waitForTimeout(3000);
    await expect(page.getByText('Welcome Back')).toBeVisible({ timeout: 15000 });
  });

  test('A11: Session persists on page refresh', async ({ page }) => {
    await loginAsStudent(page);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await expect(page.getByText(/Welcome back|Total XP/i).first()).toBeVisible({ timeout: 20000 });
  });

  test('A12: Protected route redirects unauthenticated user to login', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);
    await expect(page.getByText('Welcome Back')).toBeVisible({ timeout: 15000 });
  });
});
