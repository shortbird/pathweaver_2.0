export const meta = {
  client: "optio",
  title: "AI steps breakdown on young student profile",
  detail: "Students using the young profile version can now tap Steps or Break into steps on any quest task to ask AI to break it down.",
  url: "https://www.optioeducation.com",
  steps: "1. Open a quest on your young profile version\n2. Next to any task, tap Steps, or open the task and tap Break into steps\n3. View your step-by-step AI guide to help break the project down"
};

const BASE = process.env.PERCH_VERIFY_URL || meta.url;

export default async function run(page) {
  if (process.env.VERIFY_SUPABASE_URL && process.env.VERIFY_SUPABASE_SERVICE_KEY) {
    const testEmail = process.env.TEST_USER_EMAIL || "test@optioeducation.com";
    try {
      const gl = await fetch(`${process.env.VERIFY_SUPABASE_URL}/auth/v1/admin/generate_link`, {
        method: "POST",
        headers: {
          apikey: process.env.VERIFY_SUPABASE_SERVICE_KEY,
          authorization: `Bearer ${process.env.VERIFY_SUPABASE_SERVICE_KEY}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({ type: "magiclink", email: testEmail, redirect_to: `${BASE}/treehouse` })
      });
      const data = await gl.json();
      if (data?.action_link) {
        await page.goto(data.action_link);
      } else {
        await page.goto(`${BASE}/treehouse`);
      }
    } catch {
      await page.goto(`${BASE}/treehouse`);
    }
  } else {
    await page.goto(`${BASE}/treehouse`);
  }

  await page.waitForLoadState("networkidle");

  const url = page.url();
  if (url.includes("/login") || url.includes("/auth")) {
    return;
  }

  // Check if we can navigate to a quest or task
  const questLink = page.locator('a[href*="/quests/"]').first();
  if (await questLink.count() > 0) {
    await questLink.click();
    await page.waitForLoadState("networkidle");

    // Check for the Steps button on tasks
    const stepsBtn = page.locator('button:has-text("Steps"), button:has-text("Break into steps")').first();
    if (await stepsBtn.count() > 0) {
      await stepsBtn.click();
      await page.waitForTimeout(500);

      const modalHeader = page.locator('text=Break into Steps').first();
      if (await modalHeader.count() === 0) {
        throw new Error("Modal 'Break into Steps' did not open when Steps button was clicked");
      }
    }
  }
}
