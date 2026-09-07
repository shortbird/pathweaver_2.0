export const meta = {
  client: "icreate",
  title: "Warn staff on schedule conflicts before enrolling a student",
  detail: "Direct staff enrollment now checks for schedule conflicts and requires confirmation before enrolling a student into a class meeting at the same time.",
  url: "https://www.optioeducation.com",
  steps: `1. Open Classes in the SIS
2. Add a student to a class section
3. Try enrolling the same student into a conflicting section
4. The system warns about the time overlap before allowing enrollment`
};

const BASE = process.env.PERCH_VERIFY_URL || meta.url;

export default async function run(page) {
  await page.goto(`${BASE}/sis/classes`);
  await page.waitForLoadState('networkidle');
}
