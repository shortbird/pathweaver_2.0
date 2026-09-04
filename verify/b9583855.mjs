export const meta = {
  client: "icreate",
  title: "Attach multiple files to an onboarding checklist item",
  detail: "Onboarding items accept multiple document uploads without replacing previous files, so teachers and families can upload both an ID and a birth certificate to a single item.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open your onboarding checklist in the school console.",
    "2. Locate a checklist item that requires a document upload (such as I-9 Verification).",
    "3. Click Upload document to attach your first file (such as your Photo ID).",
    "4. Click Add another document to attach a second file (such as your Birth Certificate).",
    "5. Both attached files stay listed under the checklist item for you and the office to review.",
  ].join("\n"),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-0000b9583855'
  const staffUser = {
    id: '00000000-0000-0000-0000-0000b9583856',
    email: 'verify-teacher@example.com',
    role: 'org_managed',
    org_role: 'advisor',
    org_roles: ['advisor'],
    organization_id: ORG,
    first_name: 'Ruth',
    last_name: 'Stewart',
    display_name: 'Ruth Stewart',
    organization: { id: ORG, name: 'iCreate', feature_flags: {} },
  }

  let itemDocs = [{ path: 'staff-documents/ruth/id.pdf', filename: 'Photo_ID.pdf' }]

  const getAssignment = () => ({
    id: 'assign-1',
    organization_id: ORG,
    user_id: staffUser.id,
    template_name: 'Teacher Onboarding',
    done_count: 1,
    total_count: 1,
    audience: 'staff',
    items: [
      {
        key: 'i9-verification',
        title: 'I-9 Verification Documents',
        description: 'Please upload your ID and Birth Certificate',
        required: true,
        needs_document: true,
        status: 'complete',
        documents: itemDocs,
        document_url: itemDocs[0]?.path || null,
      },
    ],
  })

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

  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const req = route.request()
    const url = req.url()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(staffUser)(route)

    if (url.includes('/api/sis/teacher/onboarding/upload')) {
      return json({ path: 'staff-documents/ruth/birth_cert.pdf' })(route)
    }

    if (req.method() === 'PATCH' && url.includes('/api/sis/teacher/onboarding/assign-1/items/i9-verification')) {
      let body = {}
      try { body = JSON.parse(req.postData() || '{}') } catch { /* ignore */ }
      if (body.add_document) {
        itemDocs.push({
          path: body.add_document.path,
          filename: body.add_document.filename,
        })
      } else if (body.remove_document) {
        itemDocs = itemDocs.filter((d) => d.path !== body.remove_document)
      }
      return json({ assignment: getAssignment() })(route)
    }

    if (url.includes('/api/sis/teacher/onboarding')) {
      return json({ assignments: [getAssignment()] })(route)
    }

    return route.fallback()
  })

  await page.goto(`${BASE}/onboarding`)
  await page.waitForLoadState('networkidle')

  // Verify initial document is listed
  const firstDocBtn = page.getByRole('button', { name: 'Photo_ID.pdf' })
  await firstDocBtn.waitFor({ state: 'visible' })

  // Verify "Add another document" label is shown
  const addDocLabel = page.getByText('Add another document')
  if (!(await addDocLabel.isVisible())) {
    throw new Error('Expected "Add another document" button to be visible when a document is already attached')
  }

  // Set input file to trigger second upload
  const fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles({
    name: 'Birth_Certificate.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('dummy pdf content'),
  })

  // Wait for the second document to be displayed
  const secondDocBtn = page.getByRole('button', { name: 'Birth_Certificate.pdf' })
  await secondDocBtn.waitFor({ state: 'visible', timeout: 5000 })

  // Ensure BOTH documents are visible at the same time
  if (!(await firstDocBtn.isVisible()) || !(await secondDocBtn.isVisible())) {
    throw new Error('Expected both Photo_ID.pdf and Birth_Certificate.pdf to be visible simultaneously')
  }
}
