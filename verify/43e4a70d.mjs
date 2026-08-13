export const meta = {
  client: "icreate",
  title: "Warning when adding enrollment-waitlisted student to class waitlist",
  detail: "A confirmation prompt now alerts staff before adding an enrollment-waitlisted student to a class waitlist.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the Customized Learning Plan (CLP) page in the school console.",
    "2. Select a student who is currently on the enrollment waitlist.",
    "3. Click 'Join waitlist' next to a full class.",
    "4. Notice a warning prompt appears asking for confirmation before adding them to the class waitlist.",
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

  const studentAlex = {
    student_id: 's-alex-1',
    name: 'Alex Smith',
    first_name: 'Alex',
    last_name: 'Smith',
    date_of_birth: '2014-05-10',
    age: 12,
    household_id: 'h-1',
    household_name: 'Smith Family',
    grade_level: '6',
    enrollment_status: 'enrolled',
    clp_finished: false,
    is_student: true,
  }

  const clpDirectory = {
    families: [
      {
        household_id: 'h-1',
        name: 'Smith Family',
        student_count: 1,
        students: [studentAlex],
      },
    ],
    students: [studentAlex],
    counts: { total: 1, clp_finished: 0, clp_todo: 1 },
  }

  const clpStudentPayload = {
    student: {
      student_id: 's-alex-1',
      name: 'Alex Smith',
      first_name: 'Alex',
      last_name: 'Smith',
      date_of_birth: '2014-05-10',
      age: 12,
    },
    family: {
      household_id: 'h-1',
      name: 'Smith Family',
      school_name: 'iCreate Academy',
    },
    schedule: [],
    classes: [
      {
        class_id: 'c-full-1',
        name: 'Ceramics & Sculpting',
        description: 'Pottery class',
        capacity: 10,
        enrolled_count: 10,
        waitlist_count: 2,
        spots_left: 0,
        is_full: true,
        is_enrolled: false,
        on_waitlist: false,
        meetings: [],
      },
    ],
    open_requests: { waitlist: [], age_exceptions: [] },
    clp_record: { finished: false, notes: '' },
  }

  let warningDialogSeen = false

  page.on('dialog', async (dialog) => {
    if (dialog.message().includes('enrollment waitlist')) {
      warningDialogSeen = true
    }
    await dialog.accept()
  })

  const json = (obj, status = 200) => (route) => {
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
      status,
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
  await page.route('**/api/sis/clp/directory**', json(clpDirectory))
  await page.route('**/api/sis/clp/students/s-alex-1**', json(clpStudentPayload))

  await page.route('**/api/sis/classes/c-full-1/waitlist**', async (route) => {
    const req = route.request()
    const postData = req.postDataJSON() || {}
    if (postData.confirm_enrollment_waitlist) {
      return json({ success: true, entry: { id: 'w-1', status: 'waiting' } })(route)
    }
    return json({
      success: false,
      needs_confirmation: true,
      enrollment_waitlisted: true,
      error: 'Alex Smith is currently on the enrollment waitlist. Are you sure you want to add them to a class waitlist before releasing them from the enrollment waitlist?',
    }, 409)(route)
  })

  // Open the CLP page
  const clpUrl = BASE.includes('sis.') ? `${BASE}/clp` : `${BASE}/clp?app=sis`
  await page.goto(clpUrl, { waitUntil: 'domcontentloaded' })

  // Click on student
  const studentEntry = page.getByText('Alex Smith').first()
  await studentEntry.waitFor({ state: 'visible', timeout: 20000 })
  await studentEntry.click()
  await page.waitForTimeout(300)

  // Find and click "Join waitlist" button
  const joinBtn = page.getByRole('button', { name: 'Join waitlist' }).first()
  await joinBtn.waitFor({ state: 'visible', timeout: 10000 })
  await joinBtn.click()

  // Wait brief moment for dialog interaction and retry
  await page.waitForTimeout(500)

  if (!warningDialogSeen) {
    throw new Error('Warning dialog for enrollment waitlist confirmation was not presented')
  }
}
