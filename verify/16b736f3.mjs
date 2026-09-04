export const meta = {
  client: "icreate",
  title: "Form templates are easy to find and manage in Task Center",
  detail: "Expanding 'Manage forms' in the Task Center immediately lists custom and built-in form templates, and 'New form template' is accessible directly from the action menu.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the Task Center page in the school console.",
    "2. On the Requests tab, click 'Manage forms' to expand form templates.",
    "3. View, edit, or add custom form templates (like Incident reports or Supply requests) and toggle built-in forms.",
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
  await page.route('**/api/sis/staff**', json({ staff: [{ id: 's-1', name: 'Molly Admin' }] }))
  await page.route('**/api/sis/teacher/forms**', json({ form_types: { incident: 'Incident report' } }))
  await page.route('**/api/sis/staff-admin/forms**', json({ counts: { open: 0 }, submissions: [] }))
  await page.route('**/api/sis/staff-admin/onboarding/assignments**', json({ assignments: [] }))
  await page.route('**/api/sis/staff-admin/form-templates**', json({
    templates: [
      {
        id: 't-1',
        key: 'supply_request',
        name: 'Supply Request',
        audience: 'staff',
        is_active: true,
        description: 'Request classroom supplies',
        fields: [{ key: 'item', label: 'Item needed', type: 'short_text', required: true }],
      },
    ],
    builtins: [
      { key: 'incident', name: 'Incident report', hidden: false },
      { key: 'reimbursement', name: 'Reimbursement request', hidden: true },
    ],
  }))

  // Open Task Center
  const tasksUrl = BASE.includes('sis.') ? `${BASE}/tasks?tab=requests` : `${BASE}/tasks?tab=requests&app=sis`
  await page.goto(tasksUrl, { waitUntil: 'domcontentloaded' })

  // Click Manage forms
  const manageBtn = page.getByRole('button', { name: /Manage forms/i }).first()
  await manageBtn.waitFor({ state: 'visible', timeout: 20000 })
  await manageBtn.click()

  // Verify custom form and built-in form are visible
  const customForm = page.getByText('Supply Request').first()
  await customForm.waitFor({ state: 'visible', timeout: 10000 })

  const builtinForm = page.getByText('Incident report').first()
  await builtinForm.waitFor({ state: 'visible', timeout: 10000 })

  // Verify + New form button is visible and clickable
  const newFormBtn = page.getByRole('button', { name: '+ New form' }).first()
  await newFormBtn.waitFor({ state: 'visible', timeout: 10000 })
  await newFormBtn.click()

  // Verify FormEditor inputs appear
  const nameInput = page.getByPlaceholder(/Form name/i).first()
  await nameInput.waitFor({ state: 'visible', timeout: 10000 })
}
