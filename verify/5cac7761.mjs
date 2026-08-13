export const meta = {
  client: 'icreate',
  title: 'Family contract signing now waits for the document',
  detail: 'A checklist step that signs a document on the family portal (like "Photo release" or "Back to school paperwork") no longer offers the Sign box until the office has uploaded that document to their portal; until then, it explains that the document is not there yet.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open the Family Portal on a guardian account where a paperwork checklist item requires a document signature.',
    '2. If the office has not uploaded the document yet, the item no longer displays a signature box — it notes that your document is not here yet.',
    '3. Once the office uploads and shares the document to the guardian\'s portal, the document appears under "Review before signing" and the signature form becomes available.',
  ],
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

// New UI copy shipped by this fix (the withheld-sign-box message) and copy that
// has been on the family portal page since it existed.
const NEW_MARKER = 'Your document is not here yet'
const OLD_MARKER = 'Back to school paperwork'

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

  // 2. The parent signing endpoint is deployed and auth-gated: unauthenticated PATCH
  //    must be rejected by auth/CSRF (4xx), never 404/405 (old build/router).
  const patchRes = await page.request.patch(`${apiOrigin}/api/sis/parent/onboarding/x/items/y`, {
    data: { organization_id: '00000000-0000-0000-0000-000000000000' },
    failOnStatusCode: false,
  })
  if (patchRes.status() === 404 || patchRes.status() === 405) {
    throw new Error(`PATCH /api/sis/parent/onboarding returned ${patchRes.status()} — backend not deployed`)
  }
  if (patchRes.status() < 400) {
    throw new Error(`PATCH /api/sis/parent/onboarding returned ${patchRes.status()} unauthenticated — expected an auth rejection`)
  }

  // 3. The new frontend is live: crawl the built JS chunks for the new
  //    sign-box-withheld message. The family portal page is a lazy route chunk, so
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
      (/FamilyPortal|ChecklistSignature|Onboarding/.test(b) ? 1 : 0) -
      (/FamilyPortal|ChecklistSignature|Onboarding/.test(a) ? 1 : 0))
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
    ? 'Family Portal page is serving but without the sign-box gate — the new frontend build is not live'
    : `Could not locate the Family Portal chunk in ${seen.size} assets — chunk crawl needs updating`)
}
