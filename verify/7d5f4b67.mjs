export const meta = {
  client: "icreate",
  title: "Search, sort, and sticky viewport layout on Tuition page",
  detail: "The Tuition page now includes student search, sorting by name and amount, and a sticky viewport layout so search controls and invoice preview stay visible as you scroll.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the Tuition page in the school console sidebar.",
    "2. Use the search input or sort dropdown above the student queue to find or reorder students.",
    "3. Select a student to preview their invoice.",
    "4. Scroll through the student queue or invoice editor and observe that search controls and invoice preview stay pinned in view."
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

  const studentsQueue = [
    {
      student_id: 's1',
      name: 'Robin Bowman',
      household_name: 'Bowman Family',
      class_count: 2,
      estimated_total_cents: 15000,
      pay_through_ufa: false
    },
    {
      student_id: 's2',
      name: 'Uma Ford',
      household_name: 'Ford Family',
      class_count: 1,
      estimated_total_cents: 475000,
      pay_through_ufa: true
    },
    {
      student_id: 's3',
      name: 'Alex Adams',
      household_name: 'Adams Family',
      class_count: 3,
      estimated_total_cents: 25000,
      pay_through_ufa: false
    }
  ]

  const invoicePreview = {
    student: { id: 's1', name: 'Robin Bowman' },
    household_id: 'hh1',
    household_name: 'Bowman Family',
    funding_source: 'private_pay',
    funding_label: 'Private Pay',
    pay_through_ufa: false,
    tuition_plan: null,
    clp_finished: true,
    organization: { id: ORG, name: 'iCreate', logo_url: null },
    classes: [],
    line_items: [
      { class_id: 'c1', description: 'Piano Class', amount_cents: 10000 },
      { class_id: 'c2', description: 'Art Studio', amount_cents: 5000 }
    ],
    subtotal_cents: 15000,
    discount_cents: 0,
    total_cents: 15000,
    already_invoiced: false,
    existing_invoice: null
  }

  const json = (obj) => (route) => route.fulfill({
    status: 200, contentType: 'application/json', body: JSON.stringify(obj)
  })

  // Strip CSP meta tag if needed so stubs pass seamlessly (registered first so API stubs take precedence)
  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  // Stubs for offline / preview verification (registered after document handler so they win)
  await page.route('**/api/**', json({}))
  await page.route('**/api/auth/me**', json(staffUser))
  await page.route('**/api/sis/organizations/*/sis-settings**', json({ feature_flags: {} }))
  await page.route('**/api/sis/tuition/queue**', json({ students: studentsQueue, count: 3 }))
  await page.route('**/api/sis/tuition/students/*/preview**', json(invoicePreview))

  // Open the Tuition page in SIS
  await page.goto(`${BASE}/tuition?app=sis`, { waitUntil: 'domcontentloaded' })

  // Verify header and queue loaded
  await page.getByRole('heading', { name: 'Tuition' }).waitFor({ timeout: 15000 })
  await page.getByText('Robin Bowman').waitFor({ timeout: 10000 })
  await page.getByText('Uma Ford').waitFor({ timeout: 10000 })
  await page.getByText('Alex Adams').waitFor({ timeout: 10000 })

  // Verify Search functionality
  const searchInput = page.getByPlaceholder(/Search name or family/i)
  await searchInput.fill('Ford')
  await page.getByText('Uma Ford').waitFor({ timeout: 5000 })
  const robinVisibleAfterFilter = await page.getByText('Robin Bowman').count()
  if (robinVisibleAfterFilter !== 0) {
    throw new Error('Search filtering did not hide non-matching student')
  }

  // Clear search
  const clearBtn = page.getByRole('button', { name: 'Clear search' }).first()
  await clearBtn.click()
  await page.getByText('Robin Bowman').waitFor({ timeout: 5000 })

  // Verify Sort functionality
  const sortSelect = page.getByLabel('Sort queue')
  await sortSelect.selectOption('name_asc')

  // Verify invoice preview opens when a student is selected
  await page.getByText('Robin Bowman').first().click()
  await page.locator('input[value="Piano Class"]').waitFor({ timeout: 10000 })
}
