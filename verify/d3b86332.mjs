export const meta = {
  client: "icreate",
  title: "Duplicate individual items on checklist templates",
  detail: "In the checklist template editor, each item now has a Duplicate button so you can copy an existing item directly.",
  url: "https://www.optioeducation.com",
  steps: [
    "1. Open Task Center on the SIS console and click Checklists.",
    "2. Expand Checklist templates and click Edit on any template.",
    "3. Click Duplicate next to an item in the template editor.",
    "4. See that a copy of the item is added directly below titled '(copy)'.",
  ].join("\n"),
}

const BASE = (() => {
  const raw = process.env.PERCH_VERIFY_URL || meta.url
  return raw.startsWith("http") ? raw.replace(/\/$/, "") : `https://${raw.replace(/\/$/, "")}`
})()

export default async function run(page) {
  const ORG = "00000000-0000-0000-0000-0000000d3b86"
  const staffUser = {
    id: "00000000-0000-0000-0000-0000000d3b87",
    email: "verify-admin@example.com",
    role: "org_managed",
    org_role: "org_admin",
    org_roles: ["org_admin"],
    is_org_admin: true,
    organization_id: ORG,
    first_name: "Verify",
    last_name: "Admin",
    display_name: "Verify Admin",
    organization: { id: ORG, name: "Verify School", feature_flags: {} },
  }

  const sampleTemplate = {
    id: "tmpl-verify-1",
    name: "Staff Onboarding Template",
    role_type: "employee",
    audience: "staff",
    items: [
      { key: "item_1", title: "Review Employee Handbook", description: "Read policies", required: true },
    ],
  }

  const json = (obj) => (route) => {
    const origin = route.request().headers()["origin"] || BASE
    return route.fulfill({
      status: 200,
      headers: {
        "access-control-allow-origin": origin,
        "access-control-allow-credentials": "true",
        "content-type": "application/json",
      },
      body: JSON.stringify(obj),
    })
  }

  // Intercept API routes for consistent verification environment
  await page.route((u) => u.toString().includes("/api/"), (route) => {
    const url = route.request().url()
    if (url.includes("/src/")) return route.fallback()

    if (url.includes("/api/auth/me")) return json(staffUser)(route)
    if (url.includes("/api/sis/staff-admin/onboarding/templates")) {
      if (route.request().method() === "PUT" || route.request().method() === "POST") {
        return json({ success: true })(route)
      }
      return json({ templates: [sampleTemplate] })(route)
    }
    if (url.includes("/api/sis/staff-admin/onboarding/assignments")) return json({ assignments: [] })(route)
    if (url.includes("/api/sis/teacher/onboarding")) return json({ assignments: [] })(route)
    if (url.includes("/api/sis/user-orgs")) return json({ organizations: [staffUser.organization] })(route)

    return route.fallback()
  })

  // Navigate to Tasks / Onboarding page
  await page.goto(`${BASE}/tasks?tab=checklists`, { waitUntil: "networkidle" })

  // Expand Checklist templates section if collapsed
  const templatesToggle = page.locator('button:has-text("Checklist templates")').first()
  if (await templatesToggle.count() > 0) {
    const expanded = await templatesToggle.getAttribute("aria-expanded")
    if (expanded !== "true") {
      await templatesToggle.click()
      await page.waitForTimeout(300)
    }
  }

  // Click Edit on the template
  const editBtn = page.locator('button:has-text("Edit")').first()
  if (await editBtn.count() === 0) {
    throw new Error("Could not find Edit button for checklist template")
  }
  await editBtn.click()

  // Find the Duplicate button for the item inside template editor
  const duplicateItemBtn = page.locator('button[title="Duplicate this item"], button:has-text("Duplicate")').first()
  if (await duplicateItemBtn.count() === 0) {
    throw new Error("Could not find Duplicate button for item in template editor")
  }
  await duplicateItemBtn.click()

  // Verify duplicated item title input exists with "(copy)"
  const copyInput = page.locator('input[value*="(copy)"]').first()
  if (await copyInput.count() === 0) {
    throw new Error("Duplicated item with '(copy)' title was not found in the template editor")
  }
}
