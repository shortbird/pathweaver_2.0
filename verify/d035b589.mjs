export const meta = {
  client: 'icreate',
  title: 'Contract signing now waits until the contract is uploaded',
  detail: 'A "sign it here" checklist item can no longer be signed while there is nothing to sign: the office attaches each person\'s document on the Onboarding page, the person is notified, and only then does the signing form appear. A Void signature button clears signatures that were recorded before any document existed.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open the SIS console and go to Onboarding.',
    '2. Under Staff progress, expand a teacher with "Review & Sign Your Contract" still pending — their line now has an Attach document button.',
    '3. Before you attach anything, that teacher\'s own checklist says "Your school hasn\'t added this document yet" instead of offering the signing form.',
    '4. Attach their contract — they\'re notified, a View document link appears on their checklist, and only now can they type their name and sign.',
    '5. Next to a signature that slipped through before (like Erik\'s), use Void signature to clear it so they can sign the real contract.',
  ],
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  // 1. The web app serves and boots. Capture the API origin from the app's own
  //    startup calls (the API host differs between staging and production).
  let apiOrigin = null
  page.on('request', (req) => {
    const u = req.url()
    if (u.indexOf('/api/') > 0 && !apiOrigin && /optio|onrender/.test(new URL(u).origin)) {
      apiOrigin = new URL(u).origin
    }
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  if (!(await page.locator('#root').count())) throw new Error('App did not render a #root element')
  if (!apiOrigin) {
    apiOrigin = BASE.includes('optioeducation.com') ? 'https://api.optioeducation.com' : BASE
  }

  // 2. The fix is in the served build. Status-probing the new endpoint proves
  //    nothing here (this API auth-rejects unknown and known routes alike
  //    before routing), so anchor on the shipped frontend instead: the
  //    Onboarding code must contain the office's "Attach document" control and
  //    the shared signature block must contain the locked-state message. Both
  //    ship in the same commit as the backend gate, and both deploys are
  //    pinned to one SHA.
  const fetchText = async (url) => {
    const r = await page.request.get(url, { failOnStatusCode: false })
    return r.ok() ? await r.text() : ''
  }
  const entryHtml = await fetchText(`${BASE}/`)
  const mainRef = entryHtml.match(/assets\/index-[\w-]+\.js/)?.[0]
  if (!mainRef) throw new Error('Could not find the app bundle in the served page')
  const mainJs = await fetchText(`${BASE}/${mainRef}`)

  const seen = new Set()
  const queue = (mainJs.match(/assets\/[\w.-]*OnboardingPage[\w.-]*\.js/g) || [])
    .map((p) => `${BASE}/${p}`)
  if (!queue.length) throw new Error('Could not find the Onboarding page in the app bundle')
  let hasAttach = false
  let hasLockedNote = false
  while (queue.length && seen.size < 20 && !(hasAttach && hasLockedNote)) {
    const url = queue.shift()
    if (seen.has(url)) continue
    seen.add(url)
    const js = await fetchText(url)
    if (js.includes('Attach document')) hasAttach = true
    if (js.includes('added this document yet')) hasLockedNote = true
    // The signature block is shared with the family portal and may sit in its
    // own chunk, referenced from this one.
    for (const rel of js.match(/\.\/[\w.-]+\.js/g) || []) {
      queue.push(`${BASE}/assets/${rel.slice(2)}`)
    }
  }
  if (!hasAttach) throw new Error('This build has no Attach document control on the Onboarding admin view — fix not deployed yet')
  if (!hasLockedNote) throw new Error('This build does not lock unsigned items that have no document — fix not deployed yet')

  // 3. The API is alive and the onboarding endpoints are auth-gated: an
  //    unauthenticated call must be rejected (4xx), never a server error.
  const attachRes = await page.request.post(
    `${apiOrigin}/api/sis/staff-admin/onboarding/assignments/x/items/y/document`,
    { failOnStatusCode: false },
  )
  if (attachRes.status() < 400 || attachRes.status() >= 500) {
    throw new Error(`Attach endpoint returned ${attachRes.status()} unauthenticated — expected a 4xx rejection`)
  }

  // 4. Optional deeper pass when the runner provides the designated Optio test
  //    account (the login form has no captcha): sign in and confirm the SIS
  //    Onboarding page renders. Optio-specific creds only — the runner's
  //    global TEST_USER_* belong to other projects.
  const email = process.env.OPTIO_TEST_EMAIL
  const password = process.env.OPTIO_TEST_PASSWORD
  if (email && password) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/^password$/i).first().fill(password)
    await page.getByRole('button', { name: /log in|sign in/i }).click()
    await page.waitForLoadState('networkidle')
    await page.goto(`${BASE}/onboarding?app=sis`, { waitUntil: 'networkidle' })
    const heading = await page.getByRole('heading', { name: 'Onboarding' }).isVisible().catch(() => false)
    if (!heading) throw new Error('SIS Onboarding page did not render for the signed-in test user')
  }
}
