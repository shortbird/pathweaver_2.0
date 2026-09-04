export const meta = {
  client: "icreate",
  title: "Class report and report tables support tiered multi-column sorting",
  detail: "Report table headers allow multi-level sorting (day, time, age, name) with correct parsing of days and times.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open Reports in the SIS console.",
    "2. Click View Class Report to generate a report table.",
    "3. Click a column header (e.g. Days) to sort by that column.",
    "4. Click another column header (e.g. Time) to add a deeper tiebreaker level to the tiered sort.",
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

  const mockClassReport = {
    fields: [
      { key: 'name', label: 'Class', hint: 'Class name', default: true },
      { key: 'days', label: 'Days', hint: 'Meeting days', default: true },
      { key: 'time', label: 'Time', hint: 'Meeting time', default: true },
      { key: 'ages', label: 'Ages', hint: 'Age range', default: true },
    ],
    selected: ['name', 'days', 'time', 'ages'],
    rows: [
      { name: 'Pottery', days: 'Tue', time: '9:00am-10:00am', ages: '8–12' },
      { name: 'Guitar Jam', days: 'Thu', time: '1:00pm-2:00pm', ages: '13+' },
      { name: 'Creative Writing', days: 'Tue', time: '11:30am-12:30pm', ages: '6–8' },
    ],
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

  // Strip CSP meta tag if present
  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  await page.route('**/api/**', json({}))
  await page.route('**/api/auth/me**', json(staffUser))
  await page.route('**/api/admin/organizations/**', json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } }))
  await page.route('**/api/sis/reports/enrollment**', json({ report: { students_in_classes: 15, active_classes: 3 } }))
  await page.route('**/api/sis/reports/revenue**', json({ report: { invoice_count: 5, billed_cents: 50000, collected_cents: 30000, outstanding_cents: 20000 } }))
  await page.route('**/api/sis/reports/attendance**', json({ report: { overall: { attendance_rate: 0.9, counts: { present: 18, absent: 2 }, total: 20 } } }))
  await page.route('**/api/sis/reports/registration-questions**', json({ questions: [] }))
  await page.route('**/api/sis/classes**', json({ classes: [] }))
  await page.route('**/api/sis/reports/classes**', json({ report: mockClassReport }))

  const reportsUrl = BASE.includes('sis.') ? `${BASE}/reports` : `${BASE}/reports?app=sis`
  await page.goto(reportsUrl, { waitUntil: 'domcontentloaded' })

  // Find and click "View class report" button
  const runButton = page.getByRole('button', { name: /View class report/i }).first()
  await runButton.waitFor({ state: 'visible', timeout: 20000 })
  await runButton.click()

  // Verify Class Report heading and rows appear
  const potteryCell = page.getByText('Pottery').first()
  await potteryCell.waitFor({ state: 'visible', timeout: 10000 })

  // Click on "Days" column header button to add sort level
  const daysHeaderButton = page.getByRole('button', { name: /Days/i }).first()
  await daysHeaderButton.click()

  // Click on "Time" column header button to add deeper tiebreaker sort level
  const timeHeaderButton = page.getByRole('button', { name: /Time/i }).first()
  await timeHeaderButton.click()

  // Verify the multi-column sort indicator is visible
  const sortIndicator = page.getByText(/Sorted by/i).first()
  await sortIndicator.waitFor({ state: 'visible', timeout: 5000 })
}
