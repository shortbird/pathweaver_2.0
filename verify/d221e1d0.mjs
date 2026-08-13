export const meta = {
  client: 'icreate',
  title: 'Classes now have an internal notes section',
  detail: 'Every class has an "Internal notes" box in its editor for whatever the office needs to remember. Notes save with the class and are for staff only — families never see them.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open the Classes page in your school console and click a class to open it.',
    '2. Scroll to the "Internal notes" section at the bottom of the class details.',
    '3. Type a note — it is labelled staff only, so families never see it.',
    '4. Press Save, then reopen the class: the note is still there.',
  ].join('\n'),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-0000d221e1d0'
  const EXISTING = 'Kiln needs a 30 minute warm-up'
  const TYPED = 'Store the glazes in the back cupboard'

  const staffUser = {
    id: '00000000-0000-0000-0000-0000d221e1d1',
    email: 'verify-admin@example.com',
    role: 'org_managed',
    org_role: 'org_admin',
    org_roles: ['org_admin'],
    is_org_admin: true,
    organization_id: ORG,
    first_name: 'Verify',
    last_name: 'Admin',
    display_name: 'Verify Admin',
    organization: { id: ORG, name: 'iCreate', feature_flags: {} },
  }

  // The office's view of one class. internal_notes rides along with it, which
  // is what the staff-only strip in the catalog service leaves in place.
  const pottery = {
    id: 'c1',
    name: 'Pottery Studio',
    description: 'Clay working and wheel throwing',
    enrolled_count: 5,
    capacity: 10,
    min_age: 8,
    max_age: 14,
    is_full: false,
    status: 'active',
    registration_status: 'open',
    meetings: [],
    primary_instructor_id: 's1',
    primary_instructor: { id: 's1', name: 'Jane Doe' },
    assistant_instructors: [],
    internal_notes: EXISTING,
  }

  // What the class list serves. The save handler rewrites this so the reload
  // after Save returns what was actually sent — the round trip the client sees.
  let stored = { ...pottery }
  let savedNotes = null

  const json = (obj) => (route) => {
    const origin = route.request().headers()['origin'] || BASE
    return route.fulfill({
      status: 200,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify(obj),
    })
  }

  // The built app ships a CSP meta tag; drop it so the stubbed responses load.
  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const req = route.request()
    const url = req.url()
    if (url.includes('/src/')) return route.fallback()

    // The save itself: record what the class editor sent up.
    if (req.method() === 'PATCH' && /\/api\/sis\/classes\/c1(\?|$)/.test(url)) {
      let body = {}
      try { body = JSON.parse(req.postData() || '{}') } catch { /* leave empty */ }
      savedNotes = body.internal_notes
      stored = { ...stored, internal_notes: body.internal_notes }
      return json({ class: stored })(route)
    }

    if (url.includes('/api/auth/me')) return json(staffUser)(route)
    if (url.includes('/api/sis/classes')) return json({ classes: [stored] })(route)
    if (url.includes('/api/sis/staff')) return json({ staff: [{ id: 's1', name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe', roles: ['advisor'] }] })(route)
    if (url.includes('/api/sis/course-settings')) return json({ course_settings: [], optio_course_tuition_cents: 25000 })(route)
    if (url.includes('/api/sis/teacher-conflicts')) return json({ conflicts: [] })(route)
    if (url.includes('/api/courses')) return json({ courses: [] })(route)
    if (url.includes('/api/admin/organizations/')) return json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } })(route)

    return json({})(route)
  })

  // ?app=sis renders the school console on hosts that aren't sis.optioeducation.com
  // (the staging preview, localhost).
  const target = BASE.includes('sis.') ? `${BASE}/classes` : `${BASE}/classes?app=sis`
  await page.goto(target, { waitUntil: 'networkidle' })

  // 1. The class list loads and the class opens.
  const row = page.locator('table').getByText('Pottery Studio').first()
  await row.waitFor({ state: 'visible', timeout: 20000 })
  await row.click()

  // 2. The Internal notes section is there, labelled staff-only, and already
  //    holds the note saved against this class.
  const notes = page.getByLabel('Internal notes')
  await notes.waitFor({ state: 'visible', timeout: 10000 })
  if (!(await page.getByText(/staff only/i).first().isVisible())) {
    throw new Error('The internal notes section does not say it is staff only')
  }
  if ((await notes.inputValue()) !== EXISTING) {
    throw new Error(`Existing internal notes did not load into the editor (saw "${await notes.inputValue()}")`)
  }

  // 3. Typing a note and saving sends it to the class.
  await notes.fill(TYPED)
  await page.getByRole('button', { name: 'Save', exact: true }).first().click()
  for (let i = 0; i < 40 && savedNotes === null; i++) await page.waitForTimeout(250)
  if (savedNotes !== TYPED) {
    throw new Error(`Save did not carry the internal notes (sent ${JSON.stringify(savedNotes)})`)
  }

  // 4. Closing the class and opening it again shows the note that was saved.
  const reopened = page.locator('table').getByText('Pottery Studio').first()
  await reopened.click()                       // collapse
  await notes.waitFor({ state: 'hidden', timeout: 10000 })
  await reopened.click()                       // and open it fresh
  const again = page.getByLabel('Internal notes')
  await again.waitFor({ state: 'visible', timeout: 10000 })
  if ((await again.inputValue()) !== TYPED) {
    throw new Error(`Reopening the class lost the saved note (saw "${await again.inputValue()}")`)
  }
}
