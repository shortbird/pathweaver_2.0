export const meta = {
  client: "icreate",
  title: "Checklist directions shown and editable",
  detail: "Directions on checklist templates are clearly labeled in the template editor, displayed in the template list and assign modal, and rendered at the top of assigned checklists for recipients.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open Task Center and go to Checklists (or Onboarding page).",
    "2. Expand Checklist templates to view template directions.",
    "3. Click Edit on a template to view the Directions field at the top.",
    "4. Expand an assigned checklist to see the directions displayed for recipients.",
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

  const sampleTemplate = {
    id: 'tmpl-1',
    organization_id: ORG,
    name: 'Staff Onboarding Packet',
    role_type: 'employee',
    audience: 'staff',
    description: 'Please complete all items below prior to your first day.',
    items: [
      { key: 'item_1', title: 'Sign employment agreement', description: '', required: true },
    ],
  }

  const sampleAssignment = {
    id: 'assign-1',
    organization_id: ORG,
    user_id: 'user-1',
    user_name: 'Ana Roger',
    template_id: 'tmpl-1',
    template_name: 'Staff Onboarding Packet',
    description: 'Please complete all items below prior to your first day.',
    status: 'in_progress',
    done_count: 0,
    total_count: 1,
    items: [
      { key: 'item_1', title: 'Sign employment agreement', status: 'pending', required: true },
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
  await page.route('**/api/auth/me**', json(staffUser))
  await page.route('**/api/admin/organizations/**', json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } }))
  await page.route('**/api/sis/staff-admin/onboarding/templates**', json({ templates: [sampleTemplate] }))
  await page.route('**/api/sis/staff-admin/onboarding/assignments**', json({ assignments: [sampleAssignment] }))
  await page.route('**/api/sis/teacher/onboarding**', json({ assignments: [] }))

  // Open Onboarding page
  const pageUrl = BASE.includes('sis.') ? `${BASE}/onboarding` : `${BASE}/onboarding?app=sis`
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' })

  // 1. Expand Checklist templates section
  const toggleBtn = page.getByRole('button', { name: /Checklist templates/i })
  await toggleBtn.waitFor({ state: 'visible', timeout: 15000 })
  await toggleBtn.click()

  // 2. Verify template title and directions are visible in template list
  const templateTitle = page.getByText('Staff Onboarding Packet').first()
  await templateTitle.waitFor({ state: 'visible', timeout: 10000 })

  const templateDirections = page.getByText('Please complete all items below prior to your first day.').first()
  await templateDirections.waitFor({ state: 'visible', timeout: 10000 })

  // 3. Click Edit on template to open template editor
  const editBtn = page.getByRole('button', { name: 'Edit' }).first()
  await editBtn.click()

  // 4. Verify Directions label and field in editor
  const directionsLabel = page.getByText(/Directions \(optional\)/i).first()
  await directionsLabel.waitFor({ state: 'visible', timeout: 10000 })

  const directionsInput = page.getByRole('textbox', { name: 'Directions' })
  await directionsInput.waitFor({ state: 'visible', timeout: 10000 })

  // 5. Close editor
  const closeBtn = page.getByRole('button', { name: 'Close' }).first()
  await closeBtn.click()

  // 6. Expand assigned checklist card to verify directions render on assigned checklist
  const assignmentSummary = page.getByText('Ana Roger').first()
  await assignmentSummary.waitFor({ state: 'visible', timeout: 10000 })
  await assignmentSummary.click()

  const cardDirections = page.getByText('Please complete all items below prior to your first day.').last()
  await cardDirections.waitFor({ state: 'visible', timeout: 10000 })
}
