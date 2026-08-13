export const meta = {
  client: 'icreate',
  title: 'Adding or saving rooms stays at your current scroll position',
  detail: 'Saving or adding classrooms in Settings now refreshes organization data in the background without reloading the page or jumping scroll position back to the top.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open Settings in the school console and scroll down to Classrooms & Rooms.',
    '2. Click + Add room or hit Save rooms.',
    '3. The page remains at your current scroll position instead of jumping to the top.',
  ].join('\n'),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  const ORG = '00000000-0000-0000-0000-00000004e841'
  const staffUser = {
    id: '00000000-0000-0000-0000-00000004e842',
    email: 'verify-admin@example.com',
    role: 'org_managed',
    org_role: 'org_admin',
    org_roles: ['org_admin'],
    is_org_admin: true,
    organization_id: ORG,
    first_name: 'Verify',
    last_name: 'Admin',
    display_name: 'Verify Admin',
    organization: {
      id: ORG,
      name: 'Verify School',
      feature_flags: {
        sis_settings: {
          rooms: [{ name: 'Room 101', description: 'Science Lab' }],
        },
      },
    },
  }

  // Echo the caller's origin. A wildcard cannot be combined with
  // allow-credentials — the browser discards the response — and the API is a
  // separate origin in production, so the stubbed /api/auth/me was thrown away
  // and every run bounced to /login before reaching Settings. Same-origin on
  // the preview this was first proved against, which is why it only broke once
  // it started re-running against production.
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

  // Target backend API calls across ports or origins
  await page.route((u) => u.toString().includes('/api/'), (route) => {
    const url = route.request().url()
    if (url.includes('/src/')) return route.fallback()

    if (url.includes('/api/auth/me')) return json(staffUser)(route)
    if (url.includes('/api/kiosk/devices')) return json({ devices: [] })(route)
    if (url.includes('/api/admin/organizations')) return json({ organization: staffUser.organization })(route)

    return json({})(route)
  })

  // Open Settings page
  const targetUrl = BASE.includes('sis.') ? `${BASE}/settings` : `${BASE}/settings?app=sis`
  await page.goto(targetUrl, { waitUntil: 'domcontentloaded' })

  const heading = page.getByText('Classrooms & Rooms', { exact: true })
  await heading.waitFor({ timeout: 20000 })

  // Scroll Classrooms & Rooms card into view
  await heading.scrollIntoViewIfNeeded()
  const initialScrollY = await page.evaluate(() => window.scrollY)

  // Click Save rooms button
  const saveBtn = page.getByRole('button', { name: 'Save rooms' })
  await saveBtn.click()

  // Brief pause to ensure any async state updates process
  await page.waitForTimeout(300)

  // Verify scroll position did not jump to 0 (top of page)
  const afterSaveScrollY = await page.evaluate(() => window.scrollY)
  if (initialScrollY > 0 && afterSaveScrollY === 0) {
    throw new Error(`Scroll position jumped to top after saving rooms (was ${initialScrollY}, became ${afterSaveScrollY})`)
  }

  // Also verify clicking + Add room maintains scroll position and adds room field
  const addRoomBtn = page.getByText('+ Add room')
  await addRoomBtn.click()

  const afterAddScrollY = await page.evaluate(() => window.scrollY)
  if (initialScrollY > 0 && afterAddScrollY === 0) {
    throw new Error(`Scroll position jumped to top after adding a room (was ${initialScrollY}, became ${afterAddScrollY})`)
  }

  // Ensure card heading is still visible
  await heading.waitFor({ timeout: 5000 })
}
