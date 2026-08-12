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

async function signIn(page) {
  const email = process.env.OPTIO_TEST_EMAIL || process.env.TEST_USER_EMAIL || 'test-superadmin@optioeducation.com'
  const password = process.env.OPTIO_TEST_PASSWORD || process.env.TEST_USER_PASSWORD || process.env.E2E_TEST_PASSWORD || 'TestPass123!'

  const supaUrl = process.env.VERIFY_SUPABASE_URL
  const serviceKey = process.env.VERIFY_SUPABASE_SERVICE_KEY
  const anonKey = process.env.VERIFY_SUPABASE_ANON_KEY || serviceKey

  // Attempt magic link sign-in if Supabase admin credentials are present in the runner
  if (supaUrl && serviceKey) {
    try {
      const gl = await fetch(`${supaUrl}/auth/v1/admin/generate_link`, {
        method: 'POST',
        headers: {
          apikey: serviceKey,
          authorization: `Bearer ${serviceKey}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ type: 'magiclink', email, redirect_to: `${BASE}/auth/callback` }),
      })
      if (gl.ok) {
        const link = await gl.json()
        const hashedToken = link.hashed_token || link.properties?.hashed_token
        if (hashedToken) {
          const vr = await fetch(`${supaUrl}/auth/v1/verify`, {
            method: 'POST',
            headers: { apikey: anonKey, 'content-type': 'application/json' },
            body: JSON.stringify({ type: 'magiclink', token_hash: hashedToken }),
          })
          if (vr.ok) {
            const session = await vr.json()
            if (session.access_token) {
              await page.goto(`${BASE}/auth/callback#access_token=${session.access_token}&refresh_token=${session.refresh_token || ''}`)
              await page.waitForURL((u) => !String(u).includes('/auth/callback'), { timeout: 15000 }).catch(() => {})
              if (!page.url().includes('/login')) return
            }
          }
        }
      }
    } catch {
      // Fallback to standard password login
    }
  }

  // Standard password login via login form
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  if (!page.url().includes('/login')) return

  const emailInput = page.getByLabel(/email/i)
  if (await emailInput.count()) {
    await emailInput.fill(email)
    await page.getByLabel(/^password$/i).first().fill(password)
    await page.getByRole('button', { name: /log in|sign in/i }).click()
    await page.waitForLoadState('networkidle')
  }

  if (page.url().includes('/login')) {
    throw new Error('Sign-in as the verify account was rejected')
  }
}

// Rows of the SIS classes table as { name, teacherCell }
async function readRows(page) {
  return page.$$eval('table tbody tr', (trs) => trs.map((tr) => {
    const tds = tr.querySelectorAll('td')
    if (tds.length < 2) return null
    return {
      name: (tds[0]?.textContent || '').trim(),
      teacherCell: (tds[1]?.textContent || '').trim(),
    }
  }).filter((r) => r && r.name))
}

export default async function run(page) {
  await signIn(page)

  // ?app=sis renders the SIS console on any host, so staging and production both
  // work from BASE.
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
  let selectedTeacher = null
  let selectedQuery = null

  for (const candidateRow of withTeacher) {
    const rawTeacher = candidateRow.teacherCell.split('\n')[0].split('+')[0].trim()
    const q = rawTeacher.toLowerCase()
    const hasNonMatch = rows.some((r) =>
      !r.teacherCell.toLowerCase().includes(q) && !r.name.toLowerCase().includes(q))
    if (hasNonMatch) {
      selectedTeacher = rawTeacher
      selectedQuery = q
      break
    }
  }

  if (!selectedTeacher) {
    throw new Error('Every class involves all available teachers — no suitable data to prove filtering')
  }

  await search.fill(selectedTeacher)
  await page.waitForTimeout(500)

  const filtered = await readRows(page)
  if (!filtered.length) throw new Error(`Searching the teacher "${selectedTeacher}" hid every class, including their own`)
  if (filtered.length >= rows.length) throw new Error(`Typing the teacher "${selectedTeacher}" did not narrow the class list`)

  const stray = filtered.find((r) =>
    !r.teacherCell.toLowerCase().includes(selectedQuery) && !r.name.toLowerCase().includes(selectedQuery))
  if (stray) throw new Error(`Searching the teacher "${selectedTeacher}" still shows an unrelated class ("${stray.name}")`)
}
