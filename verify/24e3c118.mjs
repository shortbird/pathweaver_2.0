export const meta = {
  client: 'optio',
  title: 'Families can request an age exception for a class',
  detail: 'The Schedule Builder now offers a low-key "ask the school for an age exception" link for classes hidden by age limits; requests are timestamped and staff approve (enrolls immediately) or decline them on the SIS Registration page.',
  url: 'www.optioeducation.com',
  steps: [
    '1. Sign in as a parent of an iCreate family and open the Schedule Builder.',
    '2. Click a time slot where a class exists outside your student\'s age range (e.g. an 8-year-old and a 9+ class).',
    '3. Below the class list, see "Some classes at this time are for other ages" with the "ask the school for an age exception" link; pick the class, add a note, send it.',
    '4. As school staff, open the SIS console > Registration: the timestamped request appears with Approve & enroll / Decline.',
    '5. Approve it — the class appears on the student\'s schedule right away, and the request moves to the resolved list.',
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
    if (i > 0 && !apiOrigin && !u.startsWith(BASE + '/assets')) {
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

  // 2. The new parent endpoint is deployed: unauthenticated POST must be
  //    rejected by auth/CSRF (400/401/403), never 404/405 (which would mean
  //    the old build is still serving).
  const parentRes = await page.request.post(`${apiOrigin}/api/sis/parent/age-exception-requests`, {
    data: { organization_id: '00000000-0000-0000-0000-000000000000' },
    failOnStatusCode: false,
  })
  if (parentRes.status() === 404 || parentRes.status() === 405) {
    throw new Error(`POST /api/sis/parent/age-exception-requests returned ${parentRes.status()} — endpoint not deployed`)
  }

  // 3. The staff list endpoint is deployed and auth-gated the same way.
  const staffRes = await page.request.get(`${apiOrigin}/api/sis/age-exception-requests`, {
    failOnStatusCode: false,
  })
  if (staffRes.status() === 404 || staffRes.status() === 405) {
    throw new Error(`GET /api/sis/age-exception-requests returned ${staffRes.status()} — endpoint not deployed`)
  }
  if (staffRes.status() < 400) {
    throw new Error(`GET /api/sis/age-exception-requests returned ${staffRes.status()} unauthenticated — expected an auth rejection`)
  }

  // 4. Optional deeper pass when the runner provides the designated test
  //    account (the login flow has no captcha): sign in through the real form
  //    and confirm the Schedule Builder route renders.
  const email = process.env.TEST_USER_EMAIL
  const password = process.env.TEST_USER_PASSWORD
  if (email && password) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/password/i).fill(password)
    await page.getByRole('button', { name: /log in|sign in/i }).click()
    await page.waitForLoadState('networkidle')
    await page.goto(`${BASE}/schedule-builder`, { waitUntil: 'networkidle' })
    const heading = await page.getByText('Schedule Builder').first().isVisible().catch(() => false)
    if (!heading) throw new Error('Schedule Builder page did not render for the signed-in test user')
  }
}
