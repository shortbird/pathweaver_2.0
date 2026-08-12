export const meta = {
  client: 'icreate',
  title: 'Edit a curriculum and its quests/courses in one place',
  detail: 'The Edit panel on the SIS Curriculum page now includes the quests and courses the curriculum carries (previously only visible by clicking the name), a newly saved entry opens straight onto them, and picker options coming from Optio\'s public library are labeled.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open your school admin and go to Curriculum.',
    '2. Click the pencil (Edit) next to any curriculum.',
    '3. Its quests and courses are right there in the edit panel, with pickers to add more — no need to click the name first.',
    '4. Open a picker: anything from Optio\'s public library is labeled "Optio library"; the rest are your school\'s own.',
  ],
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return (raw.startsWith('http') ? raw : `https://${raw}`).replace(/\/$/, '')
})()

// The change is frontend-only, so the deployment proof is that the served
// build carries the new UI. Both markers are new in this fix and both live in
// the SIS CurriculumPage chunk: the create-mode hint, and the library tag the
// pickers now put on Optio-library options.
const MARKERS = ['Save the entry first', 'Optio library']

export default async function run(page) {
  // 1. The app serves and boots on the SIS surface (?app=sis works on every
  //    host, so the same check runs on the staging preview and on production).
  await page.goto(`${BASE}/curriculum?app=sis`, { waitUntil: 'networkidle' })
  if (!(await page.locator('#root').count())) throw new Error('App did not render a #root element')

  // 2. Find the SIS CurriculumPage chunk via the entry bundle. Two source files
  //    are named CurriculumPage (learning surface + SIS), so check every chunk
  //    with that name and require both markers in the same one.
  const html = await (await page.request.get(`${BASE}/index.html`)).text()
  const mainPath = html.match(/assets\/index-[A-Za-z0-9_-]+\.js/)?.[0]
  if (!mainPath) throw new Error('Could not find the main JS bundle in index.html')
  const main = await (await page.request.get(`${BASE}/${mainPath}`)).text()
  const chunkNames = [...new Set(main.match(/CurriculumPage-[A-Za-z0-9_-]+\.js/g) || [])]
  if (!chunkNames.length) throw new Error('No CurriculumPage chunk referenced by the main bundle')

  let found = false
  for (const name of chunkNames) {
    const chunk = await (await page.request.get(`${BASE}/assets/${name}`)).text()
    if (MARKERS.every((m) => chunk.includes(m))) { found = true; break }
  }
  if (!found) {
    throw new Error('The deployed Curriculum page does not include the new quests/courses editing panel yet')
  }

  // 3. Optional deeper pass when the runner provides the designated Optio test
  //    account (the login form has no captcha). Only Optio-specific creds — the
  //    runner's global TEST_USER_* belong to other projects. This pass proves
  //    the behavior end-to-end but needs the account to be SIS staff of an org
  //    with curriculum entries, so missing preconditions skip rather than fail.
  const email = process.env.OPTIO_TEST_EMAIL
  const password = process.env.OPTIO_TEST_PASSWORD
  if (email && password) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/^password$/i).first().fill(password)
    await page.getByRole('button', { name: /log in|sign in/i }).click()
    await page.waitForLoadState('networkidle')
    await page.goto(`${BASE}/curriculum?app=sis`, { waitUntil: 'networkidle' })
    const editButtons = page.locator('button[aria-label^="Edit "]')
    if (await editButtons.count()) {
      await editButtons.first().click()
      const picker = page.getByPlaceholder('Add a quest…').first()
      const visible = await picker.isVisible().catch(() => false)
      if (!visible) throw new Error('The Edit panel opened without the quests/courses pickers')
    }
  }
}
