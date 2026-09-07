export const meta = {
  client: "icreate",
  title: "Next class on teacher and class rosters",
  detail: "Class rosters and printed roster exports now show where each student is scheduled to go for their next class along with its location and time.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the Classes page in the school console sidebar.",
    "2. Click the 'Roster & waitlist' button on any active class.",
    "3. See the 'Next' class location and start time listed under each student's name on the roster.",
    "4. Click 'Print / export roster' to include or print the 'Next class' column."
  ].join("\n"),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-00000007d5f4'
  const staffUser = {
    id: '00000000-0000-0000-0000-00000007d5f5',
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

  const sampleClasses = [
    {
      id: 'c1',
      name: 'Algebra 1',
      description: 'Introductory algebra',
      enrolled_count: 1,
      capacity: 10,
      min_age: 12,
      max_age: 16,
      is_full: false,
      registration_status: 'open',
      meetings: [],
      primary_instructor_id: 's1',
      primary_instructor: { id: 's1', name: 'Jane Doe' },
      assistant_instructors: [],
    },
  ]

  const sampleRoster = [
    {
      student_id: 'st1',
      name: 'Annika Larson',
      age: 14,
      email: 'annika@example.com',
      enrolled_at: '2026-08-01',
      next_class: {
        class_id: 'c2',
        name: 'Choir',
        location: 'Theater Stage',
        start_time: '10:30',
      },
    },
  ]

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

  // Strip CSP meta tag if needed so stubs pass seamlessly
  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  // Target backend API calls across ports or origins
  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const url = route.request().url()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(staffUser)(route)
    if (url.includes('/api/sis/classes/c1/enrollments')) return json({ roster: sampleRoster })(route)
    if (url.includes('/api/sis/classes/c1/sibling-sections')) return json({ sections: [] })(route)
    if (url.includes('/api/sis/classes')) return json({ classes: sampleClasses })(route)
    if (url.includes('/api/sis/roster')) return json({ roster: [] })(route)
    if (url.includes('/api/sis/staff')) return json({ staff: [] })(route)
    if (url.includes('/api/sis/course-settings')) return json({ course_settings: [], optio_course_tuition_cents: 25000 })(route)
    if (url.includes('/api/sis/teacher-conflicts')) return json({ conflicts: [] })(route)
    if (url.includes('/api/admin/organizations/')) return json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } })(route)

    return json({})(route)
  })

  const targetUrl = BASE.includes('sis.') ? `${BASE}/classes` : `${BASE}/classes?app=sis`
  await page.goto(targetUrl, { waitUntil: 'networkidle' })

  // Open roster for Algebra 1
  const rosterBtn = page.getByRole('button', { name: /roster & waitlist/i }).first()
  await rosterBtn.waitFor({ state: 'visible', timeout: 15000 })
  await rosterBtn.click()

  // Verify student Annika Larson is visible
  const studentName = page.getByText('Annika Larson').first()
  await studentName.waitFor({ state: 'visible', timeout: 10000 })

  // Verify Next class details are rendered
  const nextClassText = page.getByText(/Next:\s*Choir\s*·\s*Theater Stage\s*·\s*10:30am/i).first()
  await nextClassText.waitFor({ state: 'visible', timeout: 10000 })

  // Open Print / Export roster modal
  const exportBtn = page.getByRole('button', { name: /print \/ export/i }).first()
  await exportBtn.click()

  // Verify export modal shows "Next class" column option
  const nextClassColumn = page.getByRole('checkbox', { name: /next class/i }).first()
  await nextClassColumn.waitFor({ state: 'visible', timeout: 10000 })
}
