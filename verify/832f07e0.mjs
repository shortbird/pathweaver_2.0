export const meta = {
  client: "icreate",
  title: "Record refunds on the Billing ledger",
  detail: "Record refunds as negative payment entries directly from the Billing ledger, reopening the balance and updating receipts and invoices.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open the Billing page in the school console.",
    "2. Locate a charge with payments recorded against it on the ledger.",
    "3. Click Refund next to Record payment / Receipt.",
    "4. Enter the refunded amount, method, and an optional note, then click Record refund.",
    "5. Verify the refund appears on the charge detail and reopens the invoice balance."
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

  const json = (obj, status = 200) => (route) => {
    const origin = route.request().headers()['origin'] || BASE
    return route.fulfill({
      status,
      headers: {
        'access-control-allow-origin': origin,
        'access-control-allow-credentials': 'true',
        'content-type': 'application/json',
      },
      body: JSON.stringify(obj),
    })
  }

  let refundPosted = false

  // Intercept backend API requests
  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const url = route.request().url()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(staffUser)(route)

    if (url.includes('/api/sis/billing/ledger')) {
      return json({
        ledger: [
          {
            invoice_id: 'inv1', household_id: 'hh1', family_name: 'Bowman Family', student_name: 'Robin',
            description: 'Fall tuition', total_cents: 9000, amount_paid_cents: 0, balance_cents: 9000,
            status: 'sent', due_date: '2026-08-01', method: null, paid_at: null,
          },
          {
            invoice_id: 'inv2', household_id: 'hh1', family_name: 'Bowman Family', student_name: 'Jay',
            description: 'Art supplies', total_cents: 4000, amount_paid_cents: 4000, balance_cents: 0,
            status: 'paid', due_date: '2026-07-01', method: 'zelle', paid_at: '2026-07-05',
            payments: [
              { id: 'pay2', method: 'zelle', amount_cents: 4000, recorded_at: '2026-07-05T00:00:00Z' },
            ],
          },
        ]
      })(route)
    }

    if (url.includes('/api/sis/billing/outstanding')) {
      return json({ outstanding: [] })(route)
    }

    if (url.includes('/api/sis/invoices/inv2/refunds') && route.request().method() === 'POST') {
      refundPosted = true
      return json({ success: true, refund: { id: 'rf1' }, invoice: { id: 'inv2', status: 'partial' } }, 201)(route)
    }

    if (url.includes('/api/sis/organisations') || url.includes('/api/sis/organizations') || url.includes('/api/sis/tuition/recurring')) {
      return json({ schedules: [], active_monthly_cents: 0 })(route)
    }

    return route.fallback()
  })

  await page.goto(`${BASE}/billing`)
  await page.waitForLoadState('networkidle')

  // Find the Refund button on the paid row
  const refundBtn = page.getByRole('button', { name: 'Refund' }).first()
  if (await refundBtn.count() === 0) {
    throw new Error('Refund button not found on ledger')
  }

  await refundBtn.click()

  // Verify modal title
  const modalTitle = page.locator('h3, h2, .modal-title').filter({ hasText: 'Record refund' }).first()
  if (await modalTitle.count() === 0 && !(await page.getByText('Record refund').count())) {
    throw new Error('Record refund modal did not open')
  }

  // Submit refund
  const submitBtn = page.locator('button').filter({ hasText: 'Record refund' }).last()
  await submitBtn.click()

  await page.waitForTimeout(500)

  if (!refundPosted) {
    throw new Error('POST /api/sis/invoices/inv2/refunds was not triggered')
  }
}
