export const meta = {
  client: 'icreate',
  title: 'Warning when a teacher is double-booked',
  detail: 'Saving a class now cross-checks the teacher\'s other classes: if the same teacher ends up in two classes that meet at the same time, a warning appears immediately and a standing notice stays on the Classes page until the overlap is fixed.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open the Classes page in the school console and pick any class.',
    '2. Set its teacher and meeting time so they match another class that teacher already has (for example, two classes on Thursday 2pm-3pm), then hit Save.',
    '3. A warning pops up right away naming the teacher and both classes.',
    '4. A yellow "Teacher double-booked" notice also shows at the top of the Classes page until the schedule is fixed.',
  ],
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  // 1. The web app serves and boots. Capture the API origin from the app's own
  //    startup calls (the API host differs between staging and production).
  let apiOrigin = null
  page.on('request', (req) => {
    const u = req.url()
    const i = u.indexOf('/api/')
    // only origins that are plausibly OUR api — third parties (posthog etc.)
    // also serve /api/ paths and must not win the sniff
    if (i > 0 && !apiOrigin && /optio|onrender/.test(new URL(u).origin)) {
      apiOrigin = new URL(u).origin
    }
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const hasRoot = await page.locator('#root').count()
  if (!hasRoot) throw new Error('App did not render a #root element')

  if (!apiOrigin) {
    // Fallback: production convention.
    apiOrigin = BASE.includes('optioeducation.com') ? 'https://api.optioeducation.com' : BASE
  }

  // 2. The new teacher-conflicts endpoint is deployed: unauthenticated GET must
  //    be rejected by auth (401/403), never 404/405 (which would mean the old
  //    build is still serving). The Classes page's banner and post-save warning
  //    both read from this endpoint.
  const res = await page.request.get(`${apiOrigin}/api/sis/teacher-conflicts`, {
    failOnStatusCode: false,
  })
  if (res.status() === 404 || res.status() === 405) {
    throw new Error(`GET /api/sis/teacher-conflicts returned ${res.status()} — endpoint not deployed`)
  }
  if (res.status() < 400) {
    throw new Error(`GET /api/sis/teacher-conflicts returned ${res.status()} unauthenticated — expected an auth rejection`)
  }
}
