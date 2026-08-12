export const meta = {
  client: 'icreate',
  title: 'Manage classrooms and assign them from a drop-down',
  detail: 'A new Classrooms & Rooms section in Settings lets staff enter room names and descriptions. When creating or editing a class, staff can pick a classroom directly from a drop-down list.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open Settings in the school console and scroll to Classrooms & Rooms.',
    '2. Click + Add room, enter a room name and description, then hit Save rooms.',
    '3. Go to the Classes page and edit or create a class.',
    '4. Under Schedule, click the Classroom dropdown to pick your saved room.',
  ].join('\n'),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-00000004e841'
  const staffUser = {
    id: '00000000-0000-0000-0000-00000004e842',
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
      feature_flags: {
        sis_settings: {
          rooms: [{ name: 'Room 101', description: 'Science Lab' }],
        },
      },
    },
  }

  const sampleClass = {
    id: 'class-1',
    name: 'Intro to Science',
    location: 'Room 101',
    registration_status: 'open',
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
  await page.route('**/api/sis/classes**', json({ success: true, classes: [sampleClass] }))
  await page.route('**/api/sis/staff**', json({ success: true, staff: [] }))

  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  // 1. Verify Classrooms & Rooms section in Settings page
  await page.goto(`${BASE}/settings?app=sis`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Classrooms & Rooms', { exact: true }).waitFor({ timeout: 20000 })
  await page.getByText('+ Add room').waitFor({ timeout: 5000 })
  await page.getByRole('button', { name: 'Save rooms' }).waitFor({ timeout: 5000 })

  // 2. Verify Classroom dropdown in Classes page
  await page.goto(`${BASE}/classes?app=sis`, { waitUntil: 'domcontentloaded' })
  await page.getByText('Intro to Science', { exact: true }).waitFor({ timeout: 20000 })

  // Click row to expand inline editor
  await page.getByText('Intro to Science', { exact: true }).click()

  // Verify Classroom dropdown has Room 101 (Science Lab)
  const roomSelect = page.getByLabel('Classroom')
  await roomSelect.waitFor({ timeout: 5000 })
  const optionText = await roomSelect.textContent()
  if (!optionText.includes('Room 101 (Science Lab)')) {
    throw new Error(`Expected Classroom select options to include "Room 101 (Science Lab)", got: ${optionText}`)
  }
}
