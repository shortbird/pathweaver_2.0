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

/**
 * React Native Web renders Pressable/Button as <div> without role="button".
 * Standard Playwright button selectors don't work. This helper finds and
 * clicks elements by their exact visible text via JS evaluate.
 */
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
  // Parent redirects to family tab - wait for any content to load
  await page.waitForTimeout(3000);
}

export async function loginAsAdvisor(page: Page) {
  await login(page, USERS.advisor.email, USERS.advisor.password);
  await page.waitForTimeout(3000);
}

export async function loginAsObserver(page: Page) {
  await login(page, USERS.observer.email, USERS.observer.password);
  await page.waitForTimeout(3000);
}

export async function loginAsSuperadmin(page: Page) {
  await login(page, USERS.superadmin.email, USERS.superadmin.password);
  await page.waitForSelector('text=Welcome back', { timeout: 20000 });
}

export async function loginAsOrgAdmin(page: Page) {
  await login(page, USERS.orgAdmin.email, USERS.orgAdmin.password);
  await page.waitForTimeout(3000);
}

/**
 * Navigate by URL path - more reliable than clicking sidebar text.
 * Sidebar items: Home, Courses, Quests, Bounties, Buddy, Feed, Journal, Messages, Advisor, Admin
 * Profile and Family are NOT in the sidebar (accessed via avatar or URL).
 */
const ROUTES: Record<string, string> = {
  dashboard: '/(app)/(tabs)/dashboard',
  courses: '/(app)/(tabs)/courses',
  quests: '/(app)/(tabs)/quests',
  bounties: '/(app)/(tabs)/bounties',
  buddy: '/(app)/(tabs)/buddy',
  feed: '/(app)/(tabs)/feed',
  journal: '/(app)/(tabs)/journal',
  family: '/(app)/(tabs)/family',
  profile: '/(app)/(tabs)/profile',
  messages: '/(app)/(tabs)/messages',
  advisor: '/(app)/(tabs)/advisor',
  admin: '/(app)/(tabs)/admin',
  notifications: '/(app)/notifications',
};

/**
 * Navigate to a section. Uses sidebar click for sections in the sidebar,
 * falls back to URL for hidden sections (profile, family).
 * Must be called AFTER login (session cookies required).
 */
const SIDEBAR_ITEMS = ['dashboard', 'courses', 'quests', 'bounties', 'buddy', 'feed', 'journal', 'messages', 'advisor', 'admin'];
const SIDEBAR_LABELS: Record<string, string> = {
  dashboard: 'Home',
  courses: 'Courses',
  quests: 'Quests',
  bounties: 'Bounties',
  buddy: 'Buddy',
  feed: 'Feed',
  journal: 'Journal',
  messages: 'Messages',
  advisor: 'Advisor',
  admin: 'Admin',
};

export async function navigateTo(page: Page, section: string) {
  const key = section.toLowerCase();
  if (SIDEBAR_ITEMS.includes(key)) {
    // Click sidebar link - use locator to find the nav item
    const label = SIDEBAR_LABELS[key];
    await page.locator(`text="${label}"`).first().click();
    await page.waitForTimeout(2000);
  } else {
    // Hidden sections (profile, family, notifications) - use hash navigation
    const path = ROUTES[key];
    if (!path) throw new Error(`Unknown section: ${section}`);
    // Navigate within the same origin to preserve cookies
    await page.evaluate((p: string) => { window.location.hash = ''; window.history.pushState({}, '', p); }, path);
    await page.waitForTimeout(1000);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
  }
}
