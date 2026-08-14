export const meta = {
  client: "icreate",
  title: "Duplicate onboarding templates and reorder template items",
  detail: "Staff admins can now duplicate existing onboarding templates and reorder items/sections up and down.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open Onboarding from your school console sidebar.",
    "2. Click Edit on any onboarding template to open the template editor.",
    "3. Use the Up and Down buttons on any section to reorder it and click Save template.",
    "4. Click Duplicate on any template in the templates list to instantly create a copy."
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

  let templates = [
    {
      id: 'tmpl-1',
      organization_id: ORG,
      name: 'Employee Onboarding',
      role_type: 'employee',
      audience: 'staff',
      items: [
        { key: 'item_1', title: 'Welcome & Overview', description: 'Read employee handbook', required: true },
        { key: 'item_2', title: 'Background Check Form', description: 'Submit consent form', required: true },
      ],
    },
  ]

  let duplicatedCalled = false
  let putReorderedCalled = false

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

  // Target backend API calls
  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const url = route.request().url()
    const method = route.request().method()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(staffUser)(route)

    if (url.includes('/api/sis/staff-admin/onboarding/templates')) {
      if (method === 'GET') {
        return json({ success: true, templates })(route)
      }
      if (method === 'POST') {
        const postData = JSON.parse(route.request().postData() || '{}')
        if (postData.name && postData.name.includes('(Copy)')) {
          duplicatedCalled = true
        }
        const newTmpl = {
          id: `tmpl-${templates.length + 1}`,
          ...postData,
        }
        templates.push(newTmpl)
        return json({ success: true, template: newTmpl })(route)
      }
      if (method === 'PUT') {
        const postData = JSON.parse(route.request().postData() || '{}')
        if (postData.items && postData.items[0]?.title === 'Background Check Form') {
          putReorderedCalled = true
        }
        return json({ success: true })(route)
      }
    }

    if (url.includes('/api/sis/staff-admin/onboarding/assignments') || url.includes('/api/sis/teacher/onboarding')) {
      return json({ success: true, assignments: [] })(route)
    }

    if (url.includes('/api/admin/organizations/')) {
      return json({ organization: { id: ORG, name: 'iCreate', feature_flags: {} } })(route)
    }

    return json({ success: true })(route)
  })

  // Open Onboarding page
  const targetUrl = BASE.includes('sis.') ? `${BASE}/onboarding` : `${BASE}/onboarding?app=sis`
  await page.goto(targetUrl, { waitUntil: 'networkidle' })

  // 1. Verify template is rendered
  await page.getByText('Employee Onboarding').waitFor({ state: 'visible', timeout: 15000 })

  // 2. Click Duplicate button
  const duplicateBtn = page.getByRole('button', { name: 'Duplicate' }).first()
  await duplicateBtn.waitFor({ state: 'visible' })
  await duplicateBtn.click()

  // Wait for duplicate request to be handled
  await page.waitForTimeout(500)
  if (!duplicatedCalled) {
    throw new Error('Clicking Duplicate did not call template creation endpoint with copied template payload')
  }

  // 3. Edit original template and test moving sections up/down
  const editBtn = page.getByRole('button', { name: 'Edit' }).first()
  await editBtn.click()

  const downBtn = page.getByRole('button', { name: '↓ Down' }).first()
  await downBtn.waitFor({ state: 'visible' })
  await downBtn.click()

  // Save template
  const saveBtn = page.getByRole('button', { name: 'Save template' })
  await saveBtn.click()

  await page.waitForTimeout(500)
  if (!putReorderedCalled) {
    throw new Error('Saving template after moving item down did not send reordered items to backend')
  }
}
