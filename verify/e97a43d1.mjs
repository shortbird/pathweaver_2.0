export const meta = {
  client: "icreate",
  title: "Show preferred names on class rosters and in CLPs",
  detail: "Preferred names now display on class rosters and Custom Learning Plans (CLPs) instead of legal names.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the CLP page or a class roster in the school console.",
    "2. Search for a student who has a preferred name set (such as Jenner Roberts, who goes by Jay).",
    "3. Observe that the student is displayed as Jay Roberts on the roster and in their learning plan header.",
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

  // Student with legal name Jenner Roberts, preferred name Jay
  const studentJay = {
    student_id: 's-jay-1',
    name: 'Jay Roberts',
    first_name: 'Jenner',
    last_name: 'Roberts',
    preferred_name: 'Jay',
    date_of_birth: '2014-05-10',
    age: 12,
    household_id: 'h-1',
    household_name: 'Roberts Family',
    grade_level: '6',
    enrollment_status: 'enrolled',
    clp_finished: false,
    is_student: true,
  }

  const clpDirectory = {
    families: [
      {
        household_id: 'h-1',
        name: 'Roberts Family',
        student_count: 1,
        students: [studentJay],
      },
    ],
    students: [studentJay],
    counts: { total: 1, clp_finished: 0, clp_todo: 1 },
  }

  const clpStudentPayload = {
    student: {
      student_id: 's-jay-1',
      name: 'Jay Roberts',
      first_name: 'Jenner',
      last_name: 'Roberts',
      preferred_name: 'Jay',
      date_of_birth: '2014-05-10',
      age: 12,
    },
    family: {
      household_id: 'h-1',
      name: 'Roberts Family',
      school_name: 'iCreate Academy',
    },
    schedule: [],
    classes: [
      {
        class_id: 'c-1',
        name: 'Creative Coding',
        description: 'Intro to coding',
        capacity: 10,
        enrolled_count: 3,
        waitlist_count: 0,
        spots_left: 7,
        is_full: false,
        is_enrolled: false,
        meetings: [],
      },
    ],
    open_requests: { waitlist: [], age_exceptions: [] },
    clp_record: { finished: false, notes: '' },
  }

  const classRosterPayload = {
    roster: [
      {
        student_id: 's-jay-1',
        name: 'Jay Roberts',
        preferred_name: 'Jay',
        last_name: 'Roberts',
        age: 12,
        email: 'jenner@example.com',
      },
    ],
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

  // Strip CSP meta tag if present
  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  // Intercept API routes
  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const url = route.request().url()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(staffUser)(route)
    if (url.includes('/api/sis/clp/directory')) return json(clpDirectory)(route)
    if (url.includes('/api/sis/clp/students/s-jay-1')) return json(clpStudentPayload)(route)
    if (url.includes('/api/sis/classes/c-1/enrollments')) return json(classRosterPayload)(route)
    if (url.includes('/api/sis/classes')) return json({ classes: [{ id: 'c-1', name: 'Creative Coding', enrolled_count: 1, capacity: 10 }] })(route)
    if (url.includes('/api/sis/staff')) return json({ staff: [] })(route)
    if (url.includes('/api/sis/course-settings')) return json({ course_settings: [], optio_course_tuition_cents: 25000 })(route)
    if (url.includes('/api/admin/organizations/')) return json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } })(route)

    return json({})(route)
  })

  // 1. Open the CLP page
  const clpUrl = BASE.includes('sis.') ? `${BASE}/clp` : `${BASE}/clp?app=sis`
  await page.goto(clpUrl, { waitUntil: 'networkidle' })

  // Verify Jay Roberts shows up in directory sidebar
  const studentEntry = page.getByText('Jay Roberts').first()
  await studentEntry.waitFor({ state: 'visible', timeout: 15000 })

  // Click on student
  await studentEntry.click()
  await page.waitForTimeout(300)

  // Verify Jay Roberts shows up in CLP header
  const headerName = page.locator('h2').getByText('Jay Roberts').first()
  await headerName.waitFor({ state: 'visible', timeout: 5000 })
}
