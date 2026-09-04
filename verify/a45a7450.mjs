export const meta = {
  client: 'icreate',
  title: 'Campus coordinators have access to the in-app feedback button',
  detail: 'Campus coordinators are included in staff role checks for the feedback reporter, allowing them to send feedback directly from the app.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Log in as a campus coordinator in the school console.',
    '2. Notice the feedback reporter button available on screen.',
    '3. Click the feedback button to open the report form.',
  ].join('\n'),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-000000000001'
  const coordUser = {
    id: '00000000-0000-0000-0000-000000000002',
    email: 'coord@icreate.org',
    role: 'org_managed',
    org_role: 'campus_coordinator',
    org_roles: ['campus_coordinator'],
    is_org_admin: false,
    organization_id: ORG,
    first_name: 'Campus',
    last_name: 'Coordinator',
    display_name: 'Campus Coordinator',
    organization: {
      id: ORG,
      name: 'iCreate Academy',
      slug: 'icreate',
    },
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

  // Strip CSP meta tag if present
  await page.route(`${BASE}/**`, async (route) => {
    if (route.request().resourceType() !== 'document') return route.fallback()
    const resp = await route.fetch()
    const html = (await resp.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[\s\S]*?>/i, '')
    await route.fulfill({ response: resp, body: html })
  })

  // Intercept API routes
  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const url = route.request().url()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(coordUser)(route)
    if (url.includes('/api/admin/organizations')) return json({ organization: coordUser.organization })(route)

    return json({})(route)
  })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })

  // Verify that PerchConfig is initialized with tenant matching the user's org slug
  await page.waitForFunction(
    () => window.PerchConfig && window.PerchConfig.tenant === 'icreate',
    { timeout: 15000 }
  )

  // Verify that the Perch script tag is injected into the DOM
  const scriptInjected = await page.waitForSelector(
    'script[src="https://perch.shortbird.dev/perch.js"]',
    { state: 'attached', timeout: 10000 }
  )

  if (!scriptInjected) {
    throw new Error('Perch feedback script was not injected for campus coordinator user')
  }

  const perchConfig = await page.evaluate(() => window.PerchConfig)
  if (!perchConfig || perchConfig.tenant !== 'icreate') {
    throw new Error(`Expected PerchConfig tenant to be 'icreate', got: ${perchConfig?.tenant}`)
  }
}
