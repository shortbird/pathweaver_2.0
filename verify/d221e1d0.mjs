export const meta = {
  client: 'icreate',
  title: 'Classes now have an internal notes section for staff',
  detail: 'Every class editor on the SIS Classes page has an "Internal notes" box; notes save with the class and are only ever shown to staff — never to families.',
  url: 'https://www.optioeducation.com',
  steps: [
    '1. Open the Classes page in your school console and click any class to edit it.',
    '2. Scroll to the new "Internal notes" section at the bottom of the editor.',
    '3. Type a note and hit Save — reopen the class and the note is still there.',
    '4. The note stays internal: families browsing classes never see it.',
  ],
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith('http') ? raw.replace(/\/$/, '') : `https://${raw.replace(/\/$/, '')}`
})()

export default async function run(page) {
  // 1. The web app serves and boots; sniff the API origin from its own startup
  //    calls (the API host differs between the staging preview and production).
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

  // 2. Family invariant: the public class catalog (what families and the
  //    school's website embed see) must not carry internal notes on any class.
  const embed = await page.request.get(`${apiOrigin}/api/embed/icreate/catalog`, {
    failOnStatusCode: false,
  })
  if (embed.status() !== 200) {
    throw new Error(`Public class catalog returned ${embed.status()} — cannot prove families are excluded`)
  }
  const classes = (await embed.json()).classes || []
  if (!classes.length) throw new Error('Public class catalog is empty — no class to check the family view against')
  const leaked = classes.find((c) => 'internal_notes' in c)
  if (leaked) throw new Error(`Family-facing catalog exposes internal notes on class "${leaked.name}"`)

  // 3. The staff class list stays auth-gated (401/403 unauthenticated, never
  //    404 — a 404 would mean an old build is serving).
  const staffList = await page.request.get(`${apiOrigin}/api/sis/classes`, { failOnStatusCode: false })
  if (staffList.status() === 404 || staffList.status() === 405) {
    throw new Error(`GET /api/sis/classes returned ${staffList.status()} — SIS classes endpoint missing`)
  }
  if (staffList.status() < 400) {
    throw new Error(`GET /api/sis/classes returned ${staffList.status()} unauthenticated — expected an auth rejection`)
  }

  // 4. The notes column exists (the migration is applied) — a read-only
  //    metadata probe via the runner's service credentials. The staff class
  //    payload serializes every org_classes column, so column present means
  //    staff receive it. Skipped when the runner provides no credentials.
  const supaUrl = process.env.VERIFY_SUPABASE_URL
  const supaKey = process.env.VERIFY_SUPABASE_SERVICE_KEY
  if (supaUrl && supaKey) {
    const col = await fetch(`${supaUrl}/rest/v1/org_classes?select=id,internal_notes&limit=1`, {
      headers: { apikey: supaKey, authorization: `Bearer ${supaKey}` },
    })
    if (!col.ok) {
      throw new Error('org_classes.internal_notes is missing — the migration has not been applied to this environment')
    }
  }

  // 5. Deeper pass when the project's designated test account is provided and
  //    it can reach the SIS console: the staff class payload carries the notes
  //    field. Optio-specific creds only — the runner's global TEST_USER_*
  //    belong to other projects.
  const email = process.env.OPTIO_TEST_EMAIL
  const password = process.env.OPTIO_TEST_PASSWORD
  if (email && password) {
    await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
    await page.getByLabel(/email/i).fill(email)
    await page.getByLabel(/^password$/i).first().fill(password)
    await page.getByRole('button', { name: /log in|sign in/i }).click()
    await page.waitForLoadState('networkidle')
    const r = await page.request.get(`${apiOrigin}/api/sis/classes`, { failOnStatusCode: false })
    // The test account may not be school staff — only assert when it is.
    if (r.status() === 200) {
      const rows = (await r.json()).classes || []
      if (rows.length && !('internal_notes' in rows[0])) {
        throw new Error('Staff class payload does not carry internal_notes — backend change not deployed')
      }
    }
  }
}
