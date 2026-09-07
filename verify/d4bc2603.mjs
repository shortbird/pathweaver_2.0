export const meta = {
  client: "icreate",
  title: "Tuition payment plan preference on family billing page",
  detail: "Families can now indicate whether they plan to pay tuition in full or in monthly payments directly from their Billing page.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the Billing page under your family account.",
    "2. Locate the Tuition payment plan preference card below your account balance.",
    "3. Click Monthly payments or Pay in full to set your family's preference.",
    "4. See the confirmation toast and selected preference saved for your school to review."
  ].join("\n"),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-0000000d4bc2'
  const parentUser = {
    id: '00000000-0000-0000-0000-0000000d4bc3',
    email: 'verify-parent@example.com',
    role: 'parent',
    display_name: 'Verify Parent',
    organization_id: null,
  }

  const household = {
    household_id: 'hh-verify-1',
    household_name: 'Verify Family',
    organization: { id: ORG, name: 'iCreate', online_pay_enabled: true },
    pay_through_ufa: false,
    funding_source: 'private_pay',
    payment_plan_preference: null,
    invoices: [],
    payments: [],
    totals: { invoiced_cents: 0, paid_cents: 0, balance_cents: 0 },
  }

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

  let updatedPref = null
  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const url = route.request().url()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(parentUser)(route)
    if (url.includes('/api/sis/parent/billing/payment-plan-preference')) {
      const postData = JSON.parse(route.request().postData() || '{}')
      updatedPref = postData.payment_plan_preference
      return json({ success: true, household_id: postData.household_id, payment_plan_preference: updatedPref })(route)
    }
    if (url.includes('/api/sis/parent/billing')) {
      return json({
        households: [
          {
            ...household,
            payment_plan_preference: updatedPref !== null ? updatedPref : household.payment_plan_preference,
          },
        ],
      })(route)
    }
    return json({ success: true })(route)
  })

  await page.goto(`${BASE}/family/billing`, { waitUntil: 'networkidle' })

  const cardTitle = page.locator('text=Tuition payment plan preference').first()
  await cardTitle.waitFor({ state: 'visible', timeout: 10000 })

  const monthlyBtn = page.getByRole('button', { name: 'Monthly payments', exact: true }).first()
  await monthlyBtn.click()

  await page.waitForTimeout(500)
  if (updatedPref !== 'monthly') {
    throw new Error(`Expected payment plan preference 'monthly' but got '${updatedPref}'`)
  }
}
