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
      feature_flags: {},
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
    if (url.includes('/api/sis/classes')) return json({ success: true, classes: [sampleClassVisible, sampleClassHidden] })(route)
    if (url.includes('/api/sis/staff')) return json({ success: true, staff: [] })(route)
    if (url.includes('/api/sis/course-settings')) return json({ course_settings: [], optio_course_tuition_cents: 25000 })(route)
    if (url.includes('/api/sis/teacher-conflicts')) return json({ conflicts: [] })(route)
    if (url.includes('/api/courses')) return json({ courses: [] })(route)
    if (url.includes('/api/admin/organizations/')) return json({ organization: staffUser.organization })(route)

    return json({})(route)
  })

  // 1. Verify Classes page lists both classes and shows "Hidden from parents" badge for the hidden class
  const targetUrl = BASE.includes('sis.') ? `${BASE}/classes` : `${BASE}/classes?app=sis`
  await page.goto(targetUrl, { waitUntil: 'networkidle' })

  await page.getByText('Public Microschool', { exact: true }).waitFor({ timeout: 20000 })
  await page.getByText('Internal Teacher Placement Class', { exact: true }).waitFor({ timeout: 20000 })

  // Verify "Hidden from parents" badge is visible for the hidden class
  await page.getByText('Hidden from parents', { exact: true }).waitFor({ timeout: 10000 })

  // 2. Click hidden class row to expand editor
  await page.getByText('Internal Teacher Placement Class', { exact: true }).click()

  // Verify "Show class to parents" checkbox exists
  const parentVisibilityCheckbox = page.getByLabel('Show class to parents')
  await parentVisibilityCheckbox.waitFor({ timeout: 10000 })

  const isChecked = await parentVisibilityCheckbox.isChecked()
  if (isChecked) {
    throw new Error('Expected "Show class to parents" checkbox to be unchecked for hidden class')
  }
}
