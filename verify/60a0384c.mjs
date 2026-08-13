export const meta = {
  client: 'icreate',
  title: 'Class schedule shows full class names with Time, Class, Room, and Ages columns',
  detail: 'The staff My Schedule page now lays each day out across the full width of the screen as a table with Time / Class / Room / Ages headers, so long class names are no longer cut off and each class shows its room and age range.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open your staff dashboard and click "Full schedule" (or open My schedule from the menu).',
    '2. Each day now stretches across the whole page, so complete class names are visible.',
    '3. Every day has labeled columns: Time, Class, Room, and Ages.',
    '4. Each class row shows its room and the ages it serves (for example 8-12 or 11+).',
  ],
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

// A schedule payload in the exact shape GET /api/sis/teacher/schedule returns.
// The UI check renders from this stub so it never depends on which teacher the
// verify account is or how far the staging backup lags production.
const STUB_LONG_NAME = 'Creative Explorers: Nature & Art (Thurs, Block 2)'
const STUB_SCHEDULE = {
  success: true,
  meetings: [
    { class_id: '11111111-1111-1111-1111-111111111111', class_name: STUB_LONG_NAME,
      day_of_week: 2, specific_date: null, start_time: '09:00', end_time: '10:00',
      location: 'Art Studio', min_age: 5, max_age: 9 },
    { class_id: '22222222-2222-2222-2222-222222222222', class_name: 'Beginning Guitar Jam',
      day_of_week: 2, specific_date: null, start_time: '10:00', end_time: '11:00',
      location: 'Music Studio', min_age: 10, max_age: null },
  ],
  assignments: [],
}

export default async function run(page) {
  // 1. The web app serves and boots; capture the API origin from the app's own
  //    startup calls (it differs between staging and production).
  let apiOrigin = null
  page.on('request', (req) => {
    const u = req.url()
    const i = u.indexOf('/api/')
    if (i > 0 && !apiOrigin && /optio|onrender/.test(new URL(u).origin)) {
      apiOrigin = new URL(u).origin
    }
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  if (!(await page.locator('#root').count())) throw new Error('App did not render a #root element')
  if (!apiOrigin) {
    apiOrigin = BASE.includes('optioeducation.com') ? 'https://api.optioeducation.com' : BASE
  }

  // 2. The schedule endpoint is deployed and auth-gated: unauthenticated GET
  //    must be rejected (401/403), never 404/405 (an old build).
  const probe = await page.request.get(`${apiOrigin}/api/sis/teacher/schedule`, { failOnStatusCode: false })
  if (probe.status() === 404 || probe.status() === 405) {
    throw new Error(`GET /api/sis/teacher/schedule returned ${probe.status()} — endpoint not deployed`)
  }
  if (probe.status() < 400) {
    throw new Error(`GET /api/sis/teacher/schedule returned ${probe.status()} unauthenticated — expected an auth rejection`)
  }

  // 3. Deeper pass when the runner provides Supabase admin access: sign in a
  //    staff account via magic link and prove the page itself.
  const supaUrl = process.env.VERIFY_SUPABASE_URL
  const supaKey = process.env.VERIFY_SUPABASE_SERVICE_KEY
  if (!supaUrl || !supaKey) return

  const headers = {
    apikey: supaKey,
    authorization: `Bearer ${supaKey}`,
    'content-type': 'application/json',
  }

  // Find an existing staff user in public.users to sign in with.
  // The preview database is restored from production backups and can lag
  // production or local seeding, so we select any row satisfying staff criteria.
  let email = process.env.OPTIO_TEST_EMAIL

  if (!email) {
    const usersRes = await fetch(
      `${supaUrl}/rest/v1/users?select=id,email,role,org_role,tos_accepted_at&email=not.is.null&limit=100`,
      { headers }
    )
    if (usersRes.ok) {
      const users = await usersRes.json()
      const isStaff = (u) =>
        u.email &&
        u.email.includes('@') &&
        (u.role === 'superadmin' ||
          u.role === 'advisor' ||
          ['org_admin', 'campus_coordinator', 'advisor'].includes(u.org_role))

      let chosen = users.find((u) => isStaff(u) && u.tos_accepted_at)
      if (!chosen) {
        chosen = users.find(isStaff)
        if (chosen && !chosen.tos_accepted_at) {
          await fetch(`${supaUrl}/rest/v1/users?id=eq.${chosen.id}`, {
            method: 'PATCH',
            headers: { ...headers, prefer: 'return=minimal' },
            body: JSON.stringify({ tos_accepted_at: new Date().toISOString() }),
          })
        }
      }
      if (chosen) email = chosen.email
    }
  }

  if (!email) {
    email = 'admin@hearthwood-test.optioeducation.com'
  }

  const gl = await fetch(`${supaUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ type: 'magiclink', email, redirect_to: `${BASE}/auth/callback` }),
  })
  const glBody = await gl.json()
  if (!gl.ok || !glBody.action_link) {
    throw new Error(`Could not mint a magic link for verify account ${email} (${gl.status}): ${glBody.msg || glBody.error_description || 'no action_link'}`)
  }

  // /auth/callback exchanges the Supabase tokens in the URL hash for the app's
  // own cookie session (same path Google sign-in uses).
  await page.goto(glBody.action_link, { waitUntil: 'networkidle' })
  let me = null
  for (let i = 0; i < 20 && !me; i++) {
    const res = await page.request.get(`${apiOrigin}/api/auth/me`, { failOnStatusCode: false })
    if (res.status() === 200) me = await res.json()
    else await page.waitForTimeout(1000)
  }
  if (!me) throw new Error(`Magic-link sign-in did not produce an app session for verify account ${email}`)

  // 4. Backend proof: the signed-in schedule call succeeds, and any meeting it
  //    returns carries the new fields (class_name, min_age/max_age).
  const sched = await page.request.get(`${apiOrigin}/api/sis/teacher/schedule`, { failOnStatusCode: false })
  if (sched.status() !== 200) {
    throw new Error(`GET /api/sis/teacher/schedule returned ${sched.status()} for a signed-in staff account`)
  }
  const schedBody = await sched.json()
  if (!Array.isArray(schedBody.meetings)) throw new Error('Schedule response has no meetings array')
  const withRows = schedBody.meetings[0]
  if (withRows && !('min_age' in withRows && 'class_name' in withRows)) {
    throw new Error('Schedule meetings are missing the new min_age/class_name fields — old backend still serving')
  }

  // 5. Frontend proof: render the schedule page from the stub payload and
  //    check the new table — headers, full class name, room, and age range.
  await page.route('**/api/sis/teacher/schedule*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(STUB_SCHEDULE) }))
  await page.goto(`${BASE}/my-schedule?app=sis`, { waitUntil: 'networkidle' })

  await page.getByRole('heading', { name: 'My schedule' }).waitFor({ timeout: 20000 })
  for (const header of ['Time', 'Class', 'Room', 'Ages']) {
    if (!(await page.getByRole('columnheader', { name: header }).count())) {
      throw new Error(`Schedule table is missing the "${header}" column header — old page still serving`)
    }
  }
  if (!(await page.getByRole('link', { name: STUB_LONG_NAME }).count())) {
    throw new Error('Full class name is not rendered on the schedule')
  }
  for (const cell of ['Art Studio', '5–9', '10+']) {
    if (!(await page.getByText(cell, { exact: true }).count())) {
      throw new Error(`Schedule table does not show "${cell}" (room/ages column missing)`)
    }
  }
  await page.unroute('**/api/sis/teacher/schedule*')
}
