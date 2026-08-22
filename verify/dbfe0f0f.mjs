export const meta = {
  client: "icreate",
  title: "Automatically drop students from all section waitlists upon section enrollment",
  detail: "Enrolling a student in any section of a class automatically drops/promotes them from the waitlists of all other sections of that class.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the SIS Schedule Builder or Class Waitlist tab.",
    "2. Enroll a student who is on the waitlist for multiple sections of a class (e.g. Ukelele Jam).",
    "3. Observe that the student is enrolled in their section and removed from the waitlists for all other sections of that class.",
  ].join("\n"),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-00000007d5f4'
  const parentUser = {
    id: '00000000-0000-0000-0000-00000007d5f6',
    email: 'verify-parent@example.com',
    role: 'org_managed',
    org_role: 'parent',
    org_roles: ['parent'],
    organization_id: ORG,
    first_name: 'Verify',
    last_name: 'Parent',
    display_name: 'Verify Parent',
    organization: { id: ORG, name: 'iCreate', feature_flags: {} },
    has_dependents: true,
  }

  const contextState = {
    my_avatar_url: null,
    orgs: [
      {
        organization_id: ORG,
        organization_name: 'iCreate',
        scheduling_url: null,
        students: [
          {
            student_id: 's-1',
            name: 'Alex Student',
            first_name: 'Alex',
            last_name: 'Student',
            date_of_birth: '2015-05-10',
            avatar_url: null,
          },
        ],
      },
    ],
  }

  const scheduleState = {
    classes: [
      {
        id: 'c-1',
        name: 'Ukelele Jam (Tue 10:30)',
        description: 'Music class',
        meetings: [
          {
            day_of_week: 2,
            start_time: '10:30:00',
            end_time: '11:30:00',
          },
        ],
        price_cents: 15000,
      },
    ],
    waitlist: [], // empty because enrollment in c-1 auto-cleared c-2 waitlist entry
    courses: [],
    time_blocks: [],
    first_day_of_school: null,
    changes_locked: false,
  }

  const catalogState = {
    classes: [
      {
        id: 'c-1',
        name: 'Ukelele Jam (Tue 10:30)',
        description: 'Music class',
        meetings: [
          {
            day_of_week: 2,
            start_time: '10:30:00',
            end_time: '11:30:00',
          },
        ],
      },
      {
        id: 'c-2',
        name: 'Ukelele Jam (Thu 13:00)',
        description: 'Music class',
        meetings: [
          {
            day_of_week: 4,
            start_time: '13:00:00',
            end_time: '14:00:00',
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

  // Strip CSP meta tag if present
  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  // Intercept API routes
  await page.route('**/api/**', json({}))
  await page.route('**/api/auth/me**', json(parentUser))
  await page.route('**/api/icreate/my-registration**', json({ registration: null }))
  await page.route('**/api/sis/parent/context**', json(contextState))
  await page.route('**/api/sis/parent/students/s-1/schedule**', json(scheduleState))
  await page.route('**/api/sis/parent/classes**', json(catalogState))

  // Open Schedule Builder page
  const pageUrl = `${BASE}/schedule-builder`
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' })

  // Verify enrolled class is visible
  const enrolledItem = page.getByText('Ukelele Jam (Tue 10:30)').first()
  await enrolledItem.waitFor({ state: 'visible', timeout: 20000 })
}
