import { test, expect } from '@playwright/test';
import { BASE_URL, clickByText, loginAsStudent, loginAsParent, loginAsSuperadmin, navigateTo } from './helpers';

test.describe('Smoke Suite', () => {
  test('S1: Student login -> dashboard loads', async ({ page }) => {
    await loginAsStudent(page);
    // 15s, matching S2-S4 and the other specs. These two are stat tiles that
    // need an API round-trip, and S1 was the only assertion in the suite left
    // on Playwright's 5s default -- playwright.config.ts sets `timeout: 60000`,
    // which is the TEST timeout, not the expect timeout, so it looked covered
    // and was not. It failed on 2026-09-09 against a dev backend that had
    // redeployed two minutes earlier: login reached the dashboard ("Welcome
    // back" resolved) and the tile simply had not arrived inside 5s.
    //
    // Raising this is safe because it does not weaken what is asserted -- the
    // text and its exactness are unchanged, only the patience. Do NOT "fix" a
    // future failure here by loosening the matcher instead; a missing stat tile
    // after 15s is a real regression.
    await expect(page.getByText('Total XP')).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('Active Quests')).toBeVisible({ timeout: 15000 });
  });

  test('S2: Parent login -> family view loads', async ({ page }) => {
    await loginAsParent(page);
    await expect(page.getByText('Family', { exact: true }).first()).toBeVisible({ timeout: 15000 });
  });

  test('S3: Superadmin login -> admin panel accessible', async ({ page }) => {
    await loginAsSuperadmin(page);
    await navigateTo(page, 'admin');
    await expect(page.getByText('Admin Panel')).toBeVisible({ timeout: 15000 });
  });

  test('S4: Invalid credentials -> error message', async ({ page }) => {
    await page.goto(BASE_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await page.getByPlaceholder('you@email.com').fill('invalid@test.com');
    await page.getByPlaceholder('Enter password').fill('wrongpassword');
    await clickByText(page, 'Sign In');
    await expect(page.getByText(/invalid|error|incorrect|locked|failed/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('S5: Unauthenticated user redirected to login', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForSelector('text=Welcome', { timeout: 30000 });
    await expect(page.getByPlaceholder('you@email.com')).toBeVisible();
  });

  test('S6: Student can navigate to quests', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'quests');
    await expect(page.getByText(/Discover|Browse|Quest/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('S7: Student can navigate to journal', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'journal');
    await expect(page.getByText(/Journal|Learning|Moments/i).first()).toBeVisible({ timeout: 15000 });
  });

  test('S8: Student can navigate to profile', async ({ page }) => {
    await loginAsStudent(page);
    await navigateTo(page, 'profile');
    await expect(page.getByText(/Profile|Total XP|Member since/i).first()).toBeVisible({ timeout: 15000 });
  });
});
