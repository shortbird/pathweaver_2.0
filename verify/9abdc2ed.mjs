export const meta = {
  client: 'icreate',
  title: 'Filter CSV exports by teacher or day and view column descriptions',
  detail: 'Export CSV on the SIS Classes page now includes optional filters for teacher and day, along with clear descriptions for column options like full time range, start time, and registration status.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open the Classes page in the school console',
    '2. Click Export CSV — a window opens with format choices, filters, and column options',
    '3. Review the column options to see explanations for Time, Start time, and Registration status',
    '4. Use the "Filter by teacher" or "Filter by day" drop-downs to narrow down your export',
    '5. Click Export — your CSV downloads containing only the matching classes and schedule slots',
  ],
}

const BASE = (process.env.PERCH_VERIFY_URL || meta.url).replace(/\/$/, '')

// A string literal from the new export filters — survives minification and exists in no prior build.
const MARKER = 'Filter by teacher'

async function bundleHasMarker(page) {
  const html = await (await page.request.get(`${BASE}/`)).text()
  const seen = new Set()
  const queue = [...html.matchAll(/assets\/[A-Za-z0-9._-]+\.js/g)].map((m) => m[0])
  const score = (n) => (/Classes/i.test(n) ? 0 : /Sis/i.test(n) ? 1 : /index/i.test(n) ? 2 : 3)
  let fetched = 0
  while (queue.length && fetched < 40) {
    queue.sort((a, b) => score(a) - score(b))
    const name = queue.shift()
    if (seen.has(name)) continue
    seen.add(name)
    fetched += 1
    const res = await page.request.get(`${BASE}/${name}`, { failOnStatusCode: false })
    if (!res.ok()) continue
    const js = await res.text()
    if (js.includes(MARKER)) return true
    for (const m of js.matchAll(/assets\/[A-Za-z0-9._-]+\.js/g)) {
      if (!seen.has(m[0])) queue.push(m[0])
    }
  }
  return false
}

export default async function run(page) {
  // 1. The web app serves and boots.
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
  if (!(await page.locator('#root').count())) throw new Error('App did not render a #root element')

  // 2. The deployed bundle contains the new export filters.
  if (!(await bundleHasMarker(page))) {
    throw new Error('Export filters not found in the deployed app bundle — the new build is not serving yet')
  }

  // 3. Optional deeper pass with the designated SIS staff test account
  const email = process.env.OPTIO_STAFF_TEST_EMAIL
  const password = process.env.OPTIO_STAFF_TEST_PASSWORD
  if (email && password) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/^password$/i).first().fill(password)
    await page.getByRole('button', { name: /log in|sign in/i }).click()
    await page.waitForLoadState('networkidle')
    await page.goto(`${BASE}/classes?app=sis`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const filterByTeacher = page.getByText('Filter by teacher')
    if (!(await filterByTeacher.isVisible().catch(() => false))) {
      throw new Error('Export CSV did not open the filter options on the Classes page')
    }
  }
}
