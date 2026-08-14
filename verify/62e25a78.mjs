export const meta = {
  client: 'icreate',
  title: 'Engagement alerts on teacher dashboard scoped to teacher classes',
  detail: 'The Needs attention card on the teacher dashboard now requests teacher-scoped alerts, ensuring administrators and teachers only see engagement alerts for the classes they actually teach.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Log in to your teacher portal in the SIS.',
    '2. Scroll to the bottom of your home dashboard.',
    '3. Check the "Needs attention" card to confirm it only lists students and alerts for classes you actually teach.',
  ].join('\n'),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-000062e25a78'
  const adminUser = {
    id: '00000000-0000-0000-0000-000062e25a79',
    email: 'ana.roger@example.com',
    role: 'org_managed',
    org_role: 'org_admin',
    org_roles: ['org_admin'],
    is_org_admin: true,
    organization_id: ORG,
    first_name: 'Ana',
    last_name: 'Roger',
    display_name: 'Ana Roger',
    organization: {
      id: ORG,
      name: 'iCreate Academy',
      feature_flags: { sis_enabled: true },
    },
  }

  // Dashboard data for Ana Roger (she teaches English Literature, NOT Algebra 1)
  const dashboardData = {
    today: [],
    classes: [
      { id: 'class-eng-1', name: 'English Literature', enrolled_count: 12, primary_instructor_id: adminUser.id }
    ],
    profile: { position: 'Teacher & Admin', uses_time_clock: false },
    recent_forms: [],
    pending_acks: [],
    staff_resources: [],
  }

  // Engagement alert scoped to her English class only
  const engAlerts = [
    {
      id: 'alert-1',
      alert_type: 'inactive_two_weeks',
      student_name: 'Robin Fields',
      class_name: 'English Literature',
      quest_title: 'Essay Writing',
      details: { days_threshold: 14 },
      created_at: '2026-08-01T12:00:00Z',
    },
  ]

  let requestedAlertsUrl = ''

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

  // Target backend API routes
  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const url = route.request().url()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(adminUser)(route)
    if (url.includes('/api/sis/teacher/dashboard')) return json({ success: true, data: dashboardData })(route)
    if (url.includes('/api/sis/engagement-alerts')) {
      requestedAlertsUrl = url
      return json({ success: true, alerts: engAlerts })(route)
    }
    if (url.includes('/api/admin/organizations/')) return json({ organization: adminUser.organization })(route)

    return json({ success: true })(route)
  })

  // Load teacher portal
  const targetUrl = BASE.includes('sis.') ? BASE : `${BASE}/sis/teacher`
  await page.goto(targetUrl, { waitUntil: 'networkidle' })

  // Verify dashboard loads
  await page.getByText('English Literature', { exact: false }).first().waitFor({ timeout: 20000 })

  // Verify "Needs attention" card renders Ana's English Literature alert
  await page.getByText('Needs attention', { exact: false }).first().waitFor({ timeout: 10000 })
  await page.getByText('Robin Fields', { exact: true }).waitFor({ timeout: 10000 })

  // Confirm the alerts API request included ?mine=true (or mine=true query param)
  if (!requestedAlertsUrl.includes('mine=true')) {
    throw new Error(`Expected engagement-alerts URL to contain 'mine=true', got: ${requestedAlertsUrl}`)
  }
}
