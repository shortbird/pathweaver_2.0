export const meta = {
  client: 'icreate',
  title: 'Choose what the classes CSV export looks like',
  detail: 'Export CSV on the SIS Classes page now opens a chooser: pick the columns for the class list (remembered next time), or export ready-made schedule grids with a column per teacher or per room.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open the Classes page in the school console',
    '2. Click Export CSV — a window opens instead of downloading right away',
    '3. Keep "Class list" and untick any columns you don\'t want, or pick "Schedule grid by teacher" / "Schedule grid by room"',
    '4. Click Export — the spreadsheet downloads in the shape you chose, and your choices are remembered for next time',
  ],
}

const BASE = (process.env.PERCH_VERIFY_URL || meta.url).replace(/\/$/, '')

// A string literal from the new export chooser — survives minification, and
// exists in no prior build.
const MARKER = 'Schedule grid by teacher'

// The chooser ships inside the lazy-loaded Classes chunk, so walk the built
// asset graph from the entry script instead of only what the homepage loads.
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

  // 2. The deployed bundle contains the new export chooser.
  if (!(await bundleHasMarker(page))) {
    throw new Error('Export chooser not found in the deployed app bundle — the new build is not serving yet')
  }

  // 3. Optional deeper pass with the designated SIS staff test account (the
  //    login form has no captcha). Skipped when the runner has no staff creds —
  //    a family-account login cannot open the SIS console.
  const email = process.env.OPTIO_STAFF_TEST_EMAIL
  const password = process.env.OPTIO_STAFF_TEST_PASSWORD
  if (email && password) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/^password$/i).first().fill(password)
    await page.getByRole('button', { name: /log in|sign in/i }).click()
    await page.waitForLoadState('networkidle')
    // ?app=sis renders the SIS console on any host — no sis. DNS needed.
    await page.goto(`${BASE}/classes?app=sis`, { waitUntil: 'networkidle' })
    await page.getByRole('button', { name: 'Export CSV' }).click()
    const chooser = page.getByText('Schedule grid by teacher')
    if (!(await chooser.isVisible().catch(() => false))) {
      throw new Error('Export CSV did not open the format chooser on the Classes page')
    }
    // The list format offers a column picker.
    for (const label of ['Class name', 'Description', 'Registration']) {
      if (!(await page.getByText(label, { exact: true }).first().isVisible().catch(() => false))) {
        throw new Error(`Column choice "${label}" is missing from the export chooser`)
      }
    }
  }
}
