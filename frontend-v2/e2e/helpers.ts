import { Page } from '@playwright/test';

export const BASE_URL = 'https://optio-dev-v2-frontend.onrender.com';

export const USERS = {
  student: { email: process.env.E2E_STUDENT_EMAIL || '', password: process.env.E2E_STUDENT_PASSWORD || '' },
  parent: { email: process.env.E2E_PARENT_EMAIL || '', password: process.env.E2E_PARENT_PASSWORD || '' },
  observer: { email: process.env.E2E_OBSERVER_EMAIL || '', password: process.env.E2E_OBSERVER_PASSWORD || '' },
  advisor: { email: process.env.E2E_ADVISOR_EMAIL || '', password: process.env.E2E_ADVISOR_PASSWORD || '' },
  orgAdmin: { email: process.env.E2E_ORGADMIN_EMAIL || '', password: process.env.E2E_ORGADMIN_PASSWORD || '' },
  superadmin: { email: process.env.E2E_SUPERADMIN_EMAIL || '', password: process.env.E2E_SUPERADMIN_PASSWORD || '' },
};

export async function clickByText(page: Page, text: string) {
  await page.evaluate((t: string) => {
    const elements = document.querySelectorAll('*');
    for (const el of elements) {
      if (el.textContent?.trim() === t && (el as HTMLElement).offsetHeight > 0) {
        (el as HTMLElement).click();
        return;
      }
    }
    throw new Error(`Element with text "${t}" not found`);
  }, text);
}

export async function login(page: Page, email: string, password: string) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.waitForSelector('text=Welcome', { timeout: 30000 });
  await page.getByPlaceholder('you@email.com').fill(email);
  await page.getByPlaceholder('Enter password').fill(password);
  await clickByText(page, 'Sign In');
}

export async function loginAsStudent(page: Page) {
  await login(page, USERS.student.email, USERS.student.password);
  await page.waitForSelector('text=Welcome back', { timeout: 20000 });
}

export async function loginAsParent(page: Page) {
  await login(page, USERS.parent.email, USERS.parent.password);
  await page.waitForTimeout(5000);
}

export async function loginAsAdvisor(page: Page) {
  await login(page, USERS.advisor.email, USERS.advisor.password);
  await page.waitForTimeout(5000);
}

export async function loginAsObserver(page: Page) {
  await login(page, USERS.observer.email, USERS.observer.password);
  await page.waitForTimeout(5000);
}

export async function loginAsSuperadmin(page: Page) {
  await login(page, USERS.superadmin.email, USERS.superadmin.password);
  await page.waitForSelector('text=Welcome back', { timeout: 20000 });
}

export async function loginAsOrgAdmin(page: Page) {
  await login(page, USERS.orgAdmin.email, USERS.orgAdmin.password);
  await page.waitForTimeout(5000);
}

export async function navigateTo(page: Page, sidebarLabel: string) {
  await clickByText(page, sidebarLabel);
  await page.waitForTimeout(2000);
}
