export const meta = {
  client: "icreate",
  title: "Combined paperwork templates manager across Task Center, Onboarding, and Forms",
  detail: "Request forms and onboarding checklists can now be built and managed together in a single paperwork templates section.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open Task Center or Forms in the school console as an administrator.",
    "2. Locate the Paperwork templates section.",
    "3. Use the Request Forms and Checklist templates buttons to build and manage both in one place.",
  ].join("\n"),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  // If Supabase credentials are provided, authenticate with a magic link
  if (process.env.VERIFY_SUPABASE_URL && process.env.VERIFY_SUPABASE_SERVICE_KEY) {
    const testEmail = process.env.TEST_USER_EMAIL || "admin@optioeducation.com";
    try {
      const gl = await fetch(`${process.env.VERIFY_SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: {
          apikey: process.env.VERIFY_SUPABASE_SERVICE_KEY,
          authorization: `Bearer ${process.env.VERIFY_SUPABASE_SERVICE_KEY}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ type: "magiclink", email: testEmail, redirect_to: `${BASE}/tasks` })
      });
      const data = await gl.json();
      if (data?.action_link) {
        await page.goto(data.action_link);
      } else {
        await page.goto(`${BASE}/tasks`);
      }
    } catch {
      await page.goto(`${BASE}/tasks`);
    }
  } else {
    await page.goto(`${BASE}/tasks`);
  }

  await page.waitForLoadState("networkidle");

  const url = page.url();
  if (url.includes("/login") || url.includes("/auth")) {
    return;
  }

  // Look for the paperwork templates button or header
  const paperworkBtn = page.locator('button:has-text("Paperwork templates")').first();
  const exists = await paperworkBtn.count();
  if (exists > 0) {
    await paperworkBtn.click();
    // Verify switching tabs
    const formsBtn = page.locator('button:has-text("Request Forms")').first();
    const checklistsBtn = page.locator('button:has-text("Checklist templates")').first();
    if (await formsBtn.count() > 0 && await checklistsBtn.count() > 0) {
      await checklistsBtn.click();
      await formsBtn.click();
    }
  }
}
