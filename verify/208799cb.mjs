export const meta = {
  client: 'icreate',
  title: 'Toggle class visibility for parent schedule and catalog',
  detail: 'Classes now have a Parent visibility toggle switch in the editor. Unchecking "Show to parents on schedule" hides the class from family schedule and catalog views while keeping it available for staff.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open Classes in the school console and edit or create a class.',
    '2. Under Schedule, check or uncheck "Show to parents on schedule".',
    '3. Classes hidden from parents show a "Hidden from parents" badge on your classes list.',
    '4. Hidden classes do not appear to families when they view the schedule or class catalog.',
  ].join('\n'),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-0000208799cb'
  const staffUser = {
    id: '00000000-0000-0000-0000-0000208799cc',
    email: 'verify-admin@example.com',
    role: 'org_managed',
    org_role: 'org_admin',
    org_roles: ['org_admin'],
    is_org_admin: true,
    organization_id: ORG,
    first_name: 'Verify',
    last_name: 'Admin',
    display_name: 'Verify Admin',
    organization: {
      id: ORG,
      name: 'Verify School',
    },
  }

  const sampleClassVisible = {
    id: 'class-1',
    name: 'Public Microschool',
    registration_status: 'open',
    is_visible_to_parents: true,
    meetings: [],
  }

  const sampleClassHidden = {
    id: 'class-2',
    name: 'Internal Teacher Placement Class',
    registration_status: 'open',
    is_visible_to_parents: false,
    meetings: [],
  }

  const json = (obj) => (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(obj),
    })

  await page.route('**/api/**', json({}))
  await page.route('**/api/auth/me**', json(staffUser))
  await page.route(`**/api/admin/organizations/${ORG}`, json({ organization: staffUser.organization }))
  await page.route('**/api/sis/classes**', json({ success: true, classes: [sampleClassVisible, sampleClassHidden] }))
  await page.route('**/api/sis/staff**', json({ success: true, staff: [] }))

  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  // 1. Verify Classes page lists both classes and shows "Hidden from parents" badge for the hidden class
  await page.goto(`${BASE}/classes?app=sis`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Public Microschool', { exact: true }).waitFor({ timeout: 20000 })
  await page.getByText('Internal Teacher Placement Class', { exact: true }).waitFor({ timeout: 20000 })

  // Verify "Hidden from parents" badge is visible for the hidden class
  await page.getByText('Hidden from parents', { exact: true }).waitFor({ timeout: 5000 })

  // 2. Click hidden class row to expand editor
  await page.getByText('Internal Teacher Placement Class', { exact: true }).click()

  // Verify "Show class to parents" checkbox exists
  const parentVisibilityCheckbox = page.getByLabel('Show class to parents')
  await parentVisibilityCheckbox.waitFor({ timeout: 5000 })

  const isChecked = await parentVisibilityCheckbox.isChecked()
  if (isChecked) {
    throw new Error('Expected "Show class to parents" checkbox to be unchecked for hidden class')
  }
}
