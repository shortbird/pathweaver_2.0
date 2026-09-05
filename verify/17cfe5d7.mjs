export const meta = {
  client: "icreate",
  title: "Teacher phone numbers on staff cards and edit modal",
  detail: "Staff detail cards and edit profile modals now display and allow updating teacher phone numbers.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the SIS People page and select the Staff tab.",
    "2. Click on a staff member card (such as Marika Connole) to view their detail card.",
    "3. Verify that the Phone number row displays underneath their email address.",
    "4. Click Edit profile to open the teacher form and confirm the phone number field is prefilled and editable.",
  ].join("\n"),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-00000007d5f4'
  const staffAdmin = {
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

  const staffTeacher = {
    id: 's-marika-1',
    name: 'Marika Connole',
    first_name: 'Marika',
    last_name: 'Connole',
    email: 'marika@icreate.org',
    phone_number: '801-555-0199',
    roles: ['advisor'],
    role_labels: ['Teacher'],
    bio: 'Music and fine arts teacher',
    avatar_url: null,
    last_active: '2026-09-01T12:00:00Z',
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

  // Intercept API routes
  await page.route('**/api/**', json({}))
  await page.route('**/api/auth/me**', json(staffAdmin))
  await page.route('**/api/admin/organizations/**', json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } }))
  await page.route('**/api/sis/staff', json({ staff: [staffTeacher] }))
  await page.route('**/api/sis/staff-admin/profiles/s-marika-1**', json({
    profile: {
      position: 'Music Teacher',
      phone_number: '801-555-0199',
      work_schedule: 'Mon & Wed 9-3',
    },
    assignments: [],
  }))

  // Open the People page Staff tab
  const staffUrl = BASE.includes('sis.') ? `${BASE}/people?tab=staff` : `${BASE}/people?tab=staff&app=sis`
  await page.goto(staffUrl, { waitUntil: 'domcontentloaded' })

  // Find and click on Marika Connole's staff card
  const staffCard = page.getByText('Marika Connole').first()
  await staffCard.waitFor({ state: 'visible', timeout: 20000 })
  await staffCard.click()

  // Verify Phone number is displayed in the StaffDetailModal
  const phoneRow = page.getByText('801-555-0199').first()
  await phoneRow.waitFor({ state: 'visible', timeout: 10000 })

  // Click Edit Profile button
  const editBtn = page.getByRole('button', { name: 'Edit profile' }).first()
  await editBtn.waitFor({ state: 'visible', timeout: 10000 })
  await editBtn.click()

  // Verify Phone input in TeacherModal contains the phone number
  const phoneInput = page.locator('input[name="phone_number"]').first()
  await phoneInput.waitFor({ state: 'visible', timeout: 10000 })
  const val = await phoneInput.inputValue()
  if (val !== '801-555-0199') {
    throw new Error(`Expected phone input to have '801-555-0199', got '${val}'`)
  }
}
