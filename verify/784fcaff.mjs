export const meta = {
  client: "icreate",
  title: "Accurate waitlist count and student age display on class details popup",
  detail: "Waitlist tab count now reflects active waitlist entries, excluding enrolled students, and displays student age alongside each entry.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the Classes page in the school console sidebar.",
    "2. Click Roster & waitlist on any class to open the class details popup.",
    "3. Switch to the Waitlist tab.",
    "4. Verify that the waitlist count header reflects active waitlist entries and student age is shown next to each name."
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
      name: 'Lego Robotics',
      description: 'Building and coding robots',
      enrolled_count: 10,
      capacity: 10,
      min_age: 8,
      max_age: 14,
      is_full: true,
      waitlist_count: 2,
      registration_status: 'open',
      meetings: [],
    },
  ]

  const sampleWaitlist = [
    { id: 'w1', position: 1, student_name: 'Van Stanfill', student_age: 9, age: 9, status: 'waiting' },
    { id: 'w2', position: 2, student_name: 'Nora Candland', student_age: 8, age: 8, status: 'offered' },
    { id: 'w3', position: 3, student_name: 'Already Enrolled Student', student_age: 11, age: 11, status: 'promoted' },
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

  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const url = route.request().url()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(staffUser)(route)
    if (url.includes('/sibling-sections')) return json({ sections: [] })(route)
    if (url.includes('/waitlist')) return json({ waitlist: sampleWaitlist })(route)
    if (url.includes('/api/sis/classes')) return json({ classes: sampleClasses })(route)
    if (url.includes('/api/sis/course-settings')) return json({ course_settings: [], optio_course_tuition_cents: 25000 })(route)
    if (url.includes('/api/admin/organizations/')) return json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } })(route)

    return json({})(route)
  })

  const targetUrl = BASE.includes('sis.') ? `${BASE}/classes` : `${BASE}/classes?app=sis`
  await page.goto(targetUrl, { waitUntil: 'networkidle' })

  // Open the card view or click Roster & waitlist
  await page.getByText('Lego Robotics').first().waitFor({ state: 'visible', timeout: 15000 })
  const cardToggle = page.getByTitle('Card view')
  if (await cardToggle.isVisible()) {
    if ((await cardToggle.getAttribute('aria-pressed')) !== 'true') {
      await cardToggle.click()
    }
  }

  await page.getByText('Lego Robotics').first().click()

  // Click Waitlist tab
  const waitlistTab = page.getByRole('button', { name: 'Waitlist' })
  await waitlistTab.waitFor({ state: 'visible', timeout: 10000 })
  await waitlistTab.click()

  // Verify header shows "Waitlist (2)" (excluding promoted student)
  await page.getByText('Waitlist (2)').waitFor({ state: 'visible', timeout: 5000 })

  // Verify student age is shown
  if (!(await page.getByText('age 9').isVisible())) {
    throw new Error('Student age (age 9) was expected to be visible on waitlist entry')
  }

  // Verify promoted student is not listed in waitlist
  if (await page.getByText('Already Enrolled Student').isVisible()) {
    throw new Error('Enrolled student with promoted status was expected to be excluded from waitlist list')
  }
}
