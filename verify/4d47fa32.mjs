export const meta = {
  client: "icreate",
  title: "Drag-and-drop template blocks and duplicate templates in the editor",
  detail: "Checklist template items and form fields can now be dragged to reorder blocks, and templates can be duplicated directly from inside the editor modal.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open Task Center and switch to the Checklists tab",
    "2. Expand Checklist templates and click Edit on any template",
    "3. Drag any block to reorder it or click Duplicate template to copy it",
    "4. Save your changes",
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
    id: 'tmpl-verify-1',
    organization_id: ORG,
    name: 'Verify Staff Onboarding',
    role_type: 'employee',
    audience: 'staff',
    items: [
      { key: 'item_1', title: 'First Checklist Step', description: 'Step 1 details', required: true },
      { key: 'item_2', title: 'Second Checklist Step', description: 'Step 2 details', required: true },
    ],
  }

  await page.route('**/api/auth/me**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ user: staffUser }),
    })
  })

  await page.route('**/api/sis/staff-admin/onboarding/templates**', async (route) => {
    if (route.request().method() === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ templates: [sampleTemplate] }),
      })
    } else {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true }),
      })
    }
  })

  await page.route('**/api/sis/staff-admin/onboarding/templates/*/duplicate', async (route) => {
    await route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, template: { ...sampleTemplate, id: 'tmpl-copy-1', name: 'Verify Staff Onboarding (Copy)' } }),
    })
  })

  await page.route('**/api/sis/staff-admin/onboarding/assignments**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ assignments: [] }),
    })
  })

  await page.route('**/api/sis/staff-admin/forms**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ counts: { open: 0 } }),
    })
  })

  await page.route('**/api/sis/staff-admin/signature-requests**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ batches: [] }),
    })
  })

  await page.route('**/api/sis/staff**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ staff: [] }),
    })
  })

  await page.route('**/api/sis/teacher/forms**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ form_types: {} }),
    })
  })

  await page.goto(`${BASE}/tasks?tab=checklists`)
  await page.waitForLoadState('networkidle')

  // Expand Checklist templates section
  const toggleBtn = page.getByRole('button', { name: /Checklist templates/i })
  if (await toggleBtn.count() > 0) {
    await toggleBtn.click()
  }

  // Click Edit
  const editBtn = page.getByRole('button', { name: 'Edit' }).first()
  if (await editBtn.count() > 0) {
    await editBtn.click()

    // Verify modal and items appear
    await page.waitForSelector('text=Verify Staff Onboarding')

    // Verify Duplicate template button is present in the editor modal
    const duplicateBtn = page.getByRole('button', { name: 'Duplicate template' })
    if (await duplicateBtn.count() === 0) {
      throw new Error("Duplicate template button not found in TemplateEditor modal")
    }

    // Verify drag handle title "Drag to reorder block" is present
    const dragHandles = page.getByTitle('Drag to reorder block')
    if (await dragHandles.count() < 2) {
      throw new Error("Drag handle grips not found on template items")
    }
  }
}
