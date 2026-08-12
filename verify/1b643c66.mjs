export const meta = {
  client: 'icreate',
  title: 'Clear signature button for contract onboarding',
  detail: 'Admins can now view signature details and clear previous signatures on staff onboarding items, allowing teachers to re-sign once their contract document is available.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open the Onboarding page in the school console as an administrator.',
    '2. Under Staff progress, expand a staff member\'s checklist to view their items and signature details.',
    '3. Click "Clear signature" next to a signed contract item to reset their signature.',
    '4. The item signature is cleared and reset to pending so they can sign again once their document is uploaded.',
  ],
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

const IS_PROD_TARGET = BASE.includes('optioeducation.com')

const isJson = (res) => (res.headers()['content-type'] || '').includes('application/json')

export default async function run(page) {
  let apiOrigin = null
  page.on('request', (req) => {
    const u = req.url()
    const i = u.indexOf('/api/')
    if (i > 0 && !apiOrigin && /optio|onrender/.test(new URL(u).origin)) {
      apiOrigin = new URL(u).origin
    }
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  const hasRoot = await page.locator('#root').count()
  if (!hasRoot) throw new Error('App did not render a #root element')

  if (!apiOrigin) {
    apiOrigin = IS_PROD_TARGET ? 'https://api.optioeducation.com' : BASE
  }

  // 2. Endpoint gate check.
  const res = await page.request.patch(`${apiOrigin}/api/sis/teacher/onboarding/x/items/y`, {
    data: { organization_id: '00000000-0000-0000-0000-000000000000', clear_signature: true },
    failOnStatusCode: false,
  })
  if (res.status() < 400 && isJson(res)) {
    throw new Error(`PATCH /api/sis/teacher/onboarding returned ${res.status()} unauthenticated — expected an auth rejection`)
  }
  const deployed = res.status() >= 400 && res.status() !== 404 && res.status() !== 405
  if (!deployed && IS_PROD_TARGET) {
    throw new Error(`PATCH /api/sis/teacher/onboarding returned ${res.status()} on production — endpoint not deployed`)
  }

  // 3. Behavioral proof on the shipped frontend.
  const ORG = '00000000-0000-0000-0000-00000001b643'
  const adminUser = {
    id: '00000000-0000-0000-0000-00000001b644',
    email: 'admin@example.com',
    role: 'org_managed',
    org_role: 'org_admin',
    org_roles: ['org_admin'],
    is_org_admin: true,
    organization_id: ORG,
    first_name: 'Verify',
    last_name: 'Admin',
    display_name: 'Verify Admin',
    organization: { id: ORG, name: 'Verify School', feature_flags: {} },
  }

  const assignment = {
    id: 'a1',
    template_name: 'Employee onboarding',
    user_id: 'user-karina',
    user_name: 'Karina Worlton',
    done_count: 1,
    total_count: 1,
    items: [
      {
        key: 'contract',
        title: 'Staff agreement',
        required: true,
        needs_signature: true,
        status: 'complete',
        signature: { name: 'Karina Worlton', signed_at: '2026-08-12T10:00:00Z' },
      },
    ],
  }

  let clearPatchCalled = false
  const json = (obj) => (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(obj),
  })

  await page.route('**/api/**', json({}))
  await page.route('**/api/auth/me**', json(adminUser))
  await page.route('**/api/sis/staff-admin/onboarding/templates**', json({ success: true, templates: [] }))
  await page.route('**/api/sis/staff-admin/onboarding/assignments**', json({ success: true, assignments: [assignment] }))
  await page.route('**/api/sis/teacher/onboarding/a1/items/contract**', async (route) => {
    if (route.request().method() === 'PATCH') {
      const data = route.request().postDataJSON()
      if (data?.clear_signature) {
        clearPatchCalled = true
      }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) })
    }
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) })
  })

  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  page.on('dialog', (dialog) => dialog.accept())

  await page.goto(`${BASE}/onboarding?app=sis`, { waitUntil: 'domcontentloaded' })
  const staffRow = page.getByText('Karina Worlton').first()
  await staffRow.waitFor({ timeout: 20000 })
  await staffRow.click()

  await page.getByText('Signed by').waitFor({ timeout: 10000 })

  const clearBtn = page.getByRole('button', { name: 'Clear signature' })
  await clearBtn.waitFor({ timeout: 5000 })
  await clearBtn.click()

  if (!clearPatchCalled) {
    throw new Error('Clicking Clear signature did not trigger the expected clear_signature PATCH request')
  }
}
