export const meta = {
  client: "icreate",
  title: "Payments report and recorded revenue are hidden from non-financial roles",
  detail: "Campus coordinators and non-financial staff no longer see the Payments report card or Recorded Revenue statistics on the Reports page.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the Reports page in the school console as a campus coordinator.",
    "2. Confirm that operational reports like Attendance, Enrollment, Medications, and Class Rosters are visible.",
    "3. Confirm that the Payments report card and the Recorded Revenue statistics section are not visible.",
  ].join("\n"),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-00000007d5f4'
  const coordinatorUser = {
    id: '00000000-0000-0000-0000-00000007d5f6',
    email: 'verify-coordinator@example.com',
    role: 'org_managed',
    org_role: 'campus_coordinator',
    org_roles: ['campus_coordinator'],
    is_org_admin: true,
    organization_id: ORG,
    first_name: 'Verify',
    last_name: 'Coordinator',
    display_name: 'Verify Coordinator',
    organization: { id: ORG, name: 'iCreate', feature_flags: {} },
  }

  const json = (obj) => (route) => {
    const req = route.request()
    const origin = req.headers()['origin'] || BASE
    if (req.method() === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': origin,
          'access-control-allow-credentials': 'true',
          'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
          'access-control-allow-headers': 'content-type, authorization, x-csrf-token',
        },
      })
    }
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

  // Intercept API routes
  await page.route('**/api/**', json({}))
  await page.route('**/api/auth/me**', json(coordinatorUser))
  await page.route('**/api/admin/organizations/**', json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } }))
  await page.route('**/api/sis/reports/enrollment**', json({ report: { students_in_classes: 10, active_classes: 5, by_status: {} } }))
  await page.route('**/api/sis/reports/attendance**', json({ report: { overall: { attendance_rate: 0.95, counts: { present: 19, absent: 1 }, total: 20 } } }))
  await page.route('**/api/sis/reports/registration-questions**', json({ questions: [] }))
  await page.route('**/api/sis/classes**', json({ classes: [] }))

  // Open the Reports page
  const reportsUrl = BASE.includes('sis.') ? `${BASE}/reports` : `${BASE}/reports?app=sis`
  await page.goto(reportsUrl, { waitUntil: 'domcontentloaded' })

  // Verify operational reports section heading is visible
  const attendanceHeading = page.getByRole('heading', { name: 'Attendance' }).first()
  await attendanceHeading.waitFor({ state: 'visible', timeout: 20000 })

  // Confirm Revenue (recorded) is NOT visible
  const revenueHeadingCount = await page.getByRole('heading', { name: 'Revenue (recorded)' }).count()
  if (revenueHeadingCount > 0) {
    throw new Error('Revenue (recorded) section should not be visible to campus coordinator')
  }

  // Confirm Payments report button is NOT visible
  const paymentsButtonCount = await page.getByRole('button', { name: 'View payments report' }).count()
  if (paymentsButtonCount > 0) {
    throw new Error('Payments report button should not be visible to campus coordinator')
  }
}
