export const meta = {
  client: "icreate",
  title: "Student search on attendance page and reported absences panel",
  detail: "Staff can search students by name on the attendance page, and view guardian-reported absences in a dedicated panel that jumps directly to the reported date and class.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open Attendance from your school console sidebar.",
    "2. Type a student's name into the Search students box above the roster to filter the list.",
    "3. View the 'Reported out — today and upcoming' panel at the top of the page.",
    "4. Click any reported absence to jump the attendance view directly to that date and class."
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
      id: 'class-1',
      name: 'Art Studio',
      meetings: [{ days: ['Mon', 'Wed'], start_time: '09:00', end_time: '10:00' }],
      enrolled_count: 2,
    },
  ]

  const sampleRoster = [
    { student_user_id: 'stu-1', name: 'Alice Smith', age: 10, status: 'present' },
    { student_user_id: 'stu-2', name: 'Bob Jones', age: 12, status: 'present' },
  ]

  const sampleAbsences = [
    {
      id: 'abs-1',
      student_user_id: 'stu-2',
      student_name: 'Bob Jones',
      absence_date: '2026-09-04',
      class_id: 'class-1',
      class_name: 'Art Studio',
      reason: 'Doctor appointment',
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

  // Target backend API calls
  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const url = route.request().url()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(staffUser)(route)
    if (url.includes('/api/sis/classes/class-1/attendance')) return json({ roster: sampleRoster })(route)
    if (url.includes('/api/sis/classes')) return json({ classes: sampleClasses })(route)
    if (url.includes('/api/sis/attendance/absences')) return json({ absences: sampleAbsences })(route)
    if (url.includes('/api/sis/attendance/alerts')) return json({ alerts: [], resolutions: [] })(route)
    if (url.includes('/api/admin/organizations/')) return json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } })(route)

    return json({ success: true })(route)
  })

  const targetUrl = BASE.includes('sis.') ? `${BASE}/attendance` : `${BASE}/attendance?app=sis`
  await page.goto(targetUrl, { waitUntil: 'networkidle' })

  // 1. Ensure Attendance page loaded
  await page.getByRole('heading', { name: 'Attendance' }).waitFor({ state: 'visible', timeout: 15000 })

  // 2. Select class-1
  const classPicker = page.getByPlaceholder('Search classes…')
  await classPicker.waitFor({ state: 'visible' })
  await classPicker.click()
  await page.getByText('Art Studio').first().click()

  // 3. Verify roster rendered
  await page.getByText('Alice Smith').waitFor({ state: 'visible' })
  await page.getByText('Bob Jones').waitFor({ state: 'visible' })

  // 4. Test Student Search
  const searchInput = page.getByPlaceholder('Search students…')
  await searchInput.waitFor({ state: 'visible' })
  await searchInput.fill('Alice')

  await page.waitForTimeout(200)

  // Alice Smith should be visible, Bob Jones should be hidden
  if (!(await page.getByText('Alice Smith').isVisible())) {
    throw new Error('Alice Smith was expected to be visible when searching "Alice"')
  }
  if (await page.getByText('Bob Jones').isVisible()) {
    throw new Error('Bob Jones was expected to be hidden when searching "Alice"')
  }

  // Clear search
  await searchInput.fill('')
  await page.waitForTimeout(200)

  // 5. Test Reported Absences Panel
  await page.getByText('Reported out — today and upcoming').waitFor({ state: 'visible' })
  await page.getByText('Bob Jones').first().waitFor({ state: 'visible' })
  await page.getByText('Doctor appointment').waitFor({ state: 'visible' })
}
