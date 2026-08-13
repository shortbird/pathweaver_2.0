export const meta = {
  client: "icreate",
  title: "Search by teacher on the Classes page",
  detail: "The search box on the Classes page now matches primary and assistant teacher names in addition to class titles.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the Classes page in the school console sidebar.",
    "2. Type a teacher or assistant teacher's name into the search box above the table.",
    "3. Observe that the classes list filters immediately to show only classes taught by that teacher.",
    "4. Clear or change the search query to see the class list update."
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

  const sampleStaff = [
    { id: 's1', name: 'Jane Doe', first_name: 'Jane', last_name: 'Doe', roles: ['advisor'] },
    { id: 's2', name: 'Sam Lee', first_name: 'Sam', last_name: 'Lee', roles: ['advisor'] },
    { id: 's3', name: 'Alex Assistant', first_name: 'Alex', last_name: 'Assistant', roles: ['advisor'] },
  ]

  const sampleClasses = [
    {
      id: 'c1',
      name: 'Pottery Studio',
      description: 'Clay working and wheel throwing',
      enrolled_count: 5,
      capacity: 10,
      min_age: 8,
      max_age: 14,
      is_full: false,
      registration_status: 'open',
      meetings: [],
      primary_instructor_id: 's1',
      primary_instructor: { id: 's1', name: 'Jane Doe' },
      assistant_instructors: [],
    },
    {
      id: 'c2',
      name: 'Woodworking Crafts',
      description: 'Intro to carpentry',
      enrolled_count: 3,
      capacity: 8,
      min_age: 10,
      max_age: 16,
      is_full: false,
      registration_status: 'open',
      meetings: [],
      primary_instructor_id: 's2',
      primary_instructor: { id: 's2', name: 'Sam Lee' },
      assistant_instructors: [{ id: 's3', name: 'Alex Assistant' }],
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
    if (url.includes('/api/sis/classes')) return json({ classes: sampleClasses })(route)
    if (url.includes('/api/sis/staff')) return json({ staff: sampleStaff })(route)
    if (url.includes('/api/sis/course-settings')) return json({ course_settings: [], optio_course_tuition_cents: 25000 })(route)
    if (url.includes('/api/sis/teacher-conflicts')) return json({ conflicts: [] })(route)
    if (url.includes('/api/courses')) return json({ courses: [] })(route)
    if (url.includes('/api/admin/organizations/')) return json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } })(route)

    return json({})(route)
  })

  // Use ?app=sis to ensure the SIS console surface renders on non-sis. hostnames (like preview / localhost)
  const targetUrl = BASE.includes('sis.') ? `${BASE}/classes` : `${BASE}/classes?app=sis`
  await page.goto(targetUrl, { waitUntil: 'networkidle' })

  // Ensure search box exists
  const searchInput = page.getByPlaceholder('Search…').first()
  await searchInput.waitFor({ state: 'visible', timeout: 15000 })

  // Verify both classes initially show
  await page.locator('table').getByText('Pottery Studio').waitFor({ state: 'visible' })
  await page.locator('table').getByText('Woodworking Crafts').waitFor({ state: 'visible' })

  // 1. Search by primary instructor "Jane"
  await searchInput.fill('Jane')
  await page.waitForTimeout(200)

  // Expect "Pottery Studio" (Jane Doe) to be visible, and "Woodworking Crafts" (Sam Lee) to be hidden
  if (!(await page.locator('table').getByText('Pottery Studio').isVisible())) {
    throw new Error('Pottery Studio taught by Jane Doe was expected to be visible when searching "Jane"')
  }
  if (await page.locator('table').getByText('Woodworking Crafts').isVisible()) {
    throw new Error('Woodworking Crafts taught by Sam Lee was expected to be hidden when searching "Jane"')
  }

  // 2. Search by assistant instructor "Alex"
  await searchInput.fill('Alex')
  await page.waitForTimeout(200)

  // Expect "Woodworking Crafts" (assistant Alex Assistant) to be visible, and "Pottery Studio" to be hidden
  if (!(await page.locator('table').getByText('Woodworking Crafts').isVisible())) {
    throw new Error('Woodworking Crafts with assistant Alex Assistant was expected to be visible when searching "Alex"')
  }
  if (await page.locator('table').getByText('Pottery Studio').isVisible()) {
    throw new Error('Pottery Studio was expected to be hidden when searching "Alex"')
  }

  // 3. Clear search and verify both show again
  await searchInput.fill('')
  await page.waitForTimeout(200)
  await page.locator('table').getByText('Pottery Studio').waitFor({ state: 'visible' })
  await page.locator('table').getByText('Woodworking Crafts').waitFor({ state: 'visible' })
}
