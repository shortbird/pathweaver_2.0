export const meta = {
  client: 'icreate',
  title: 'Contract signing now waits for the contract',
  detail: 'A checklist step that signs a document from the office (like "Review & Sign Your Contract") no longer offers the Sign box until the office has actually uploaded that person\'s document; the document then shows on the step to read before signing.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. In the SIS console, open Staff and click "View portal" on a teacher you have not uploaded a contract for, then open their Onboarding.',
    '2. The "Review & Sign Your Contract" step no longer has a place to sign — it says the office hasn\'t uploaded their document yet.',
    '3. Upload that teacher\'s contract in Secure Documents and share it with them.',
    '4. Their contract now appears on that step under "Review before signing", and only now can they sign it.',
  ],
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

// New UI copy shipped by this fix (the withheld-sign-box message) and copy that
// has been on the onboarding page since it existed. Finding the old string but
// not the new one means the old build is still serving; finding neither means
// the chunk crawl itself broke.
const NEW_MARKER = 'Your document is not here yet'
const OLD_MARKER = 'No onboarding checklist assigned'

export default async function run(page) {
  // 1. The web app serves and boots. Capture the API origin from the app's own
  //    startup calls (the API host differs between staging and production).
  let apiOrigin = null
  page.on('request', (req) => {
    const u = req.url()
    const i = u.indexOf('/api/')
    if (i > 0 && !apiOrigin && /optio|onrender/.test(new URL(u).origin)) {
      apiOrigin = new URL(u).origin
    }
  })
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  if (!(await page.locator('#root').count())) throw new Error('App did not render a #root element')
  if (!apiOrigin) {
    apiOrigin = BASE.includes('optioeducation.com') ? 'https://api.optioeducation.com' : BASE
  }

  // 2. The signing endpoint is deployed and auth-gated: unauthenticated PATCH
  //    must be rejected by auth/CSRF (4xx), never 404/405 (old build/router).
  const patchRes = await page.request.patch(`${apiOrigin}/api/sis/teacher/onboarding/x/items/y`, {
    data: { organization_id: '00000000-0000-0000-0000-000000000000' },
    failOnStatusCode: false,
  })
  if (patchRes.status() === 404 || patchRes.status() === 405) {
    throw new Error(`PATCH /api/sis/teacher/onboarding returned ${patchRes.status()} — backend not deployed`)
  }
  if (patchRes.status() < 400) {
    throw new Error(`PATCH /api/sis/teacher/onboarding returned ${patchRes.status()} unauthenticated — expected an auth rejection`)
  }

  // 3. The new frontend is live: crawl the built JS chunks for the new
  //    sign-box-withheld message. The onboarding page is a lazy route chunk, so
  //    walk the asset graph from the entry script.
  const seen = new Set()
  const queue = []
  const html = await (await page.request.get(`${BASE}/`)).text()
  for (const m of html.matchAll(/(?:src|href)="([^"]+\.js)"/g)) {
    queue.push(new URL(m[1], `${BASE}/`).href)
  }
  if (!queue.length) throw new Error('No JS entry scripts found in index.html')

  let foundOld = false
  while (queue.length && seen.size < 150) {
    // Chunks named after the components we changed get scanned first.
    queue.sort((a, b) =>
      (/Onboarding|ChecklistSignature|FamilyPortal/.test(b) ? 1 : 0) -
      (/Onboarding|ChecklistSignature|FamilyPortal/.test(a) ? 1 : 0))
    const url = queue.shift()
    if (seen.has(url)) continue
    seen.add(url)
    const res = await page.request.get(url, { failOnStatusCode: false })
    if (res.status() !== 200) continue
    const js = await res.text()
    if (js.includes(NEW_MARKER)) return
    if (js.includes(OLD_MARKER)) foundOld = true
    for (const m of js.matchAll(/"([\w./-]+\.js)"/g)) {
      try {
        const next = new URL(m[1], url).href
        if (next.startsWith(BASE) && !seen.has(next)) queue.push(next)
      } catch { /* not a URL */ }
    }
  }
  throw new Error(foundOld
    ? 'Onboarding page is serving but without the sign-box gate — the new frontend build is not live'
    : `Could not locate the onboarding chunk in ${seen.size} assets — chunk crawl needs updating`)
}
