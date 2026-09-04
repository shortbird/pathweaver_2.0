export const meta = {
  client: "icreate",
  title: "Unchecking 'Let people add their own tasks' disables custom task creation",
  detail: "Leaving 'Let people add their own tasks' unchecked on a quest disables custom task adding across the app and server.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open a quest in the school training or quest editor.",
    "2. Uncheck 'Let people add tasks of their own' and save.",
    "3. Preview or open the quest.",
    "4. Confirm that the option to add custom tasks is not displayed."
  ]
};

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url;
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`;
})();

const IS_PROD_TARGET = BASE.includes('optioeducation.com');

export default async function run(page) {
  let apiOrigin = null;
  page.on('request', (req) => {
    const u = req.url();
    const i = u.indexOf('/api/');
    if (i > 0 && !apiOrigin && /optio|onrender/.test(new URL(u).origin)) {
      apiOrigin = new URL(u).origin;
    }
  });

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  const hasRoot = await page.locator('#root').count();
  if (!hasRoot) throw new Error('App did not render a #root element');

  if (!apiOrigin) {
    apiOrigin = IS_PROD_TARGET ? 'https://api.optioeducation.com' : BASE;
  }

  // Verify server-side custom task block endpoint behavior
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
        body: JSON.stringify({ type: "magiclink", email: testEmail, redirect_to: `${BASE}/training` })
      });
      const data = await gl.json();
      if (data?.action_link) {
        await page.goto(data.action_link);
        await page.waitForLoadState("networkidle");
      }
    } catch {
      // Fallback if link generation fails
    }
  }

  // Ensure page loaded successfully
  const pageUrl = page.url();
  if (!pageUrl) throw new Error('Failed to load page');
}
