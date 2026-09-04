export const meta = {
  client: "icreate",
  title: "Printable Day Rosters report shows class rosters by day and time block",
  detail: "The Day Rosters report lists every student, class, teacher, and classroom location by day and time block, with single-day print buttons.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the Reports page in the SIS console.",
    "2. Locate Day rosters and click View day rosters report.",
    "3. View the schedule broken down by day and block, showing classes, room locations, teachers, and student rosters.",
    "4. Click Print Monday (or Print for all days) to print a clean roster sheet for staff.",
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

  const dayRostersData = {
    days: [
      {
        key: '1',
        label: 'Monday',
        student_count: 2,
        slots: [
          {
            slot: 'Block 1 (9:00am - 10:00am)',
            classes: [
              {
                class_id: 'c-1',
                name: 'Algebra 1',
                time: '9:00am - 10:00am',
                room: 'Room 101',
                teacher: 'Ana Rogers',
                student_count: 2,
                students: [
                  { name: 'Alice Wright', family: 'Wright Family' },
                  { name: 'Porter Wright', family: 'Wright Family' },
                ],
              },
            ],
          },
        ],
      },
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

  // Intercept API routes
  await page.route('**/api/**', json({}))
  await page.route('**/api/auth/me**', json(staffUser))
  await page.route('**/api/admin/organizations/**', json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } }))
  await page.route('**/api/sis/reports/day-rosters**', json({ success: true, report: dayRostersData }))
  await page.route('**/api/sis/reports/registration-questions**', json({ questions: [] }))

  // Navigate to Reports page
  const reportsUrl = BASE.includes('sis.') ? `${BASE}/reports` : `${BASE}/reports?app=sis`
  await page.goto(reportsUrl, { waitUntil: 'domcontentloaded' })

  // Find and click "View day rosters report" button
  const runBtn = page.getByRole('button', { name: /View day rosters report/i }).first()
  await runBtn.waitFor({ state: 'visible', timeout: 15000 })
  await runBtn.click()

  // Verify the Day Rosters report displays
  const mondayHeader = page.getByRole('heading', { name: /Monday/i }).first()
  await mondayHeader.waitFor({ state: 'visible', timeout: 10000 })

  const className = page.getByText('Algebra 1').first()
  await className.waitFor({ state: 'visible', timeout: 5000 })

  const roomText = page.getByText(/Room 101/).first()
  await roomText.waitFor({ state: 'visible', timeout: 5000 })

  const studentName = page.getByText('Alice Wright').first()
  await studentName.waitFor({ state: 'visible', timeout: 5000 })

  const printBtn = page.getByRole('button', { name: 'Print Monday' }).first()
  await printBtn.waitFor({ state: 'visible', timeout: 5000 })
}
