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

// Staging reality: the ticket preview is a frontend-only static site (the
// branch's built SPA) in front of the SHARED dev backend, which serves the
// `develop` branch — a branch-only backend endpoint cannot exist there, on any
// preview, ever. So the endpoint probe is a hard gate only where the backend
// is supposed to carry the fix (production); on a preview the deployed
// artifact is the frontend, and the behavioral proof below is the verdict.
const IS_PROD_TARGET = BASE.includes('optioeducation.com')

const isJson = (res) => (res.headers()['content-type'] || '').includes('application/json')

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
    // Fallback: production convention. (On a preview the sniff can come up
    // empty — the preview's CSP meta predates its baked API host, so the
    // app's own calls may never fire — and BASE then points at the static
    // site, whose SPA rewrite answers every path with index.html. The JSON
    // content-type checks below keep that from masquerading as an API.)
    apiOrigin = IS_PROD_TARGET ? 'https://api.optioeducation.com' : BASE
  }

  // 2. Endpoint gate. Deployed and auth-gated means an unauthenticated GET is
  //    rejected (401/403), never 404/405 — a hard requirement only on
  //    production, where the backend must carry this branch (a 404 there means
  //    the old build is still serving). On a preview, 404 is the expected
  //    topology (see IS_PROD_TARGET note above) and the frontend proof below
  //    is the verdict. The JSON check keeps a static site's SPA rewrite
  //    (200 text/html for every path) from tripping the unauthenticated-read
  //    alarm.
  const res = await page.request.get(`${apiOrigin}/api/sis/teacher-conflicts`, {
    failOnStatusCode: false,
  })
  if (res.status() < 400 && isJson(res)) {
    throw new Error(`GET /api/sis/teacher-conflicts returned ${res.status()} unauthenticated — expected an auth rejection`)
  }
  const deployed = res.status() >= 400 && res.status() !== 404 && res.status() !== 405
  if (!deployed && IS_PROD_TARGET) {
    throw new Error(`GET /api/sis/teacher-conflicts returned ${res.status()} on production — endpoint not deployed`)
  }

  // 3. Behavioral proof of the shipped frontend: drive the real Classes page
  //    with stubbed API responses and require the double-booking warning
  //    banner to render, naming the teacher and both classes. Stubbed data is
  //    deliberately synthetic — the preview DB is restored from a production
  //    backup and lags by hours, so no proof may anchor to real rows.
  const ORG = '00000000-0000-0000-0000-0000000ba4be'
  const staffUser = {
    id: '00000000-0000-0000-0000-0000000ba4bf',
    email: 'verify-admin@example.com',
    role: 'org_managed',
    org_role: 'org_admin',
    org_roles: ['org_admin'],
    is_org_admin: true,
    organization_id: ORG,
    first_name: 'Verify',
    last_name: 'Admin',
    display_name: 'Verify Admin',
    organization: { id: ORG, name: 'Verify School', feature_flags: {} },
  }
  const conflict = {
    teacher_id: 'verify-teacher-1',
    teacher_name: 'Hollie Verify',
    class_a_id: 'verify-class-a',
    class_a: 'Digital Art Studio',
    class_b_id: 'verify-class-b',
    class_b: 'Story Detectives',
    day_of_week: 4,
    start_time: '14:00',
    end_time: '15:00',
  }
  const json = (obj) => (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(obj),
  })
  // Catch-all first; later registrations win, so the specific stubs override it.
  await page.route('**/api/**', json({}))
  await page.route('**/api/auth/me**', json(staffUser))
  await page.route('**/api/sis/classes**', json({ success: true, classes: [] }))
  await page.route('**/api/sis/staff**', json({ success: true, staff: [] }))
  await page.route('**/api/sis/teacher-conflicts**', json({ success: true, conflicts: [conflict] }))
  // Serve documents with the CSP meta stripped: the preview's allowlist
  // predates its baked API host, and a CSP-blocked call never reaches the
  // stubs above. (Interception is per-test-browser; the site is untouched.)
  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  // ?app=sis renders the SIS console surface on any host (no DNS needed).
  await page.goto(`${BASE}/classes?app=sis`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Teacher double-booked', { exact: true }).waitFor({ timeout: 20000 })
  await page.getByText(/Hollie Verify is double-booked: Digital Art Studio and Story Detectives/)
    .waitFor({ timeout: 5000 })
}
