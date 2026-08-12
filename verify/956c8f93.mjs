export const meta = {
  client: 'icreate',
  title: 'Find classes by typing a teacher\'s name',
  detail: 'The search box on the SIS Classes page now matches teacher names (including assistants) as well as class names.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open the Classes page in your school console.',
    '2. Click the search box above the list — it now says "Search by class or teacher…".',
    '3. Type a teacher\'s name.',
    '4. The list narrows to just the classes that teacher runs.',
  ],
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return (raw.startsWith('http') ? raw : `https://${raw}`).replace(/\/$/, '')
})()

// Designated Optio verify account (superadmin — can view the iCreate org's SIS
// console). The runner's global TEST_USER_EMAIL belongs to other projects, so it
// must not be used here (same caveat as verify/24e3c118.mjs).
const TEST_EMAIL = 'test-superadmin@optioeducation.com'

// Sign in without driving the login form: mint an admin magic link, exchange its
// hashed token for Supabase session tokens, and hand them to the app's own
// /auth/callback page (which swaps them for an app session — same path as OAuth).
async function signIn(page) {
  const supaUrl = process.env.VERIFY_SUPABASE_URL
  const serviceKey = process.env.VERIFY_SUPABASE_SERVICE_KEY
  const anonKey = process.env.VERIFY_SUPABASE_ANON_KEY || serviceKey
  if (!supaUrl || !serviceKey) throw new Error('Verify credentials are not configured for this environment')

  const gl = await fetch(`${supaUrl}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ type: 'magiclink', email: TEST_EMAIL, redirect_to: `${BASE}/auth/callback` }),
  })
  const link = await gl.json()
  if (!gl.ok) throw new Error(`Could not mint a sign-in link for the verify account (${gl.status})`)
  const hashedToken = link.hashed_token || link.properties?.hashed_token
  const actionLink = link.action_link || link.properties?.action_link

  // Preferred: verify the token server-side ourselves — immune to the auth
  // redirect allow-list rewriting where the action link lands.
  let tokens = null
  if (hashedToken) {
    const vr = await fetch(`${supaUrl}/auth/v1/verify`, {
      method: 'POST',
      headers: { apikey: anonKey, 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'magiclink', token_hash: hashedToken }),
    })
    if (vr.ok) {
      const session = await vr.json()
      if (session.access_token) tokens = session
    }
  }

  if (tokens) {
    await page.goto(`${BASE}/auth/callback#access_token=${tokens.access_token}&refresh_token=${tokens.refresh_token || ''}`)
  } else if (actionLink) {
    await page.goto(actionLink)
    // If the allow-list bounced the redirect to a different host, carry the
    // token hash to the app's callback ourselves.
    const landed = new URL(page.url())
    if (!page.url().startsWith(BASE) && landed.hash.includes('access_token')) {
      await page.goto(`${BASE}/auth/callback${landed.hash}`)
    }
  } else {
    throw new Error('The sign-in link service returned neither a token nor a link')
  }

  // The callback page exchanges the token and then hard-redirects into the app.
  await page.waitForURL((u) => !String(u).includes('/auth/callback'), { timeout: 30000 })
  if (page.url().includes('/login')) throw new Error('Sign-in as the verify account was rejected')
}

// Rows of the SIS classes table as { name, teacherCell } — teacherCell holds the
// primary teacher plus any assistants, exactly the text staff see.
async function readRows(page) {
  return page.$$eval('table tbody tr', (trs) => trs.map((tr) => {
    const tds = tr.querySelectorAll('td')
    return {
      name: (tds[0]?.textContent || '').trim(),
      teacherCell: (tds[1]?.textContent || '').trim(),
    }
  }).filter((r) => r.name))
}

export default async function run(page) {
  await signIn(page)

  // ?app=sis renders the SIS console on any host, so staging and production both
  // work from BASE. The verify superadmin lands on the iCreate org by default.
  await page.goto(`${BASE}/classes?app=sis`, { waitUntil: 'networkidle' })

  // The new placeholder is itself proof the fix is live.
  const search = page.getByPlaceholder(/Search by class or teacher/)
  await search.waitFor({ timeout: 30000 })

  // The teacher column lives in the table view.
  const tableToggle = page.locator('button[title="Table view"]')
  if (await tableToggle.count() && (await tableToggle.getAttribute('aria-pressed')) !== 'true') {
    await tableToggle.click()
  }
  await page.locator('table tbody tr').first().waitFor({ timeout: 30000 })

  const rows = await readRows(page)
  const withTeacher = rows.filter((r) => r.teacherCell && r.teacherCell !== '—')
  if (!withTeacher.length) throw new Error('No classes with a teacher assigned — no suitable data to prove teacher search')

  // Pick a teacher, and require at least one class that does NOT involve them
  // (not in the teacher cell, not in the class name) so filtering is observable.
  const teacher = withTeacher[0].teacherCell.split('\n')[0].split('+')[0].trim()
  const q = teacher.toLowerCase()
  const nonMatch = rows.find((r) =>
    !r.teacherCell.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q))
  if (!nonMatch) throw new Error(`Every class involves "${teacher}" — no suitable data to prove filtering`)

  await search.fill(teacher)
  await page.waitForFunction(
    (before) => document.querySelectorAll('table tbody tr').length < before,
    rows.length,
    { timeout: 10000 },
  ).catch(() => { throw new Error(`Typing the teacher "${teacher}" did not narrow the class list`) })

  const filtered = await readRows(page)
  if (!filtered.length) throw new Error(`Searching the teacher "${teacher}" hid every class, including their own`)
  const stray = filtered.find((r) =>
    !r.teacherCell.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q))
  if (stray) throw new Error(`Searching the teacher "${teacher}" still shows an unrelated class ("${stray.name}")`)
}
