import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Ratchet: pages that fetch by hand may shrink, never grow (QF-03).
 *
 * Two data-fetching paradigms live in the web app. `hooks/api/` (react-query) is the one
 * the codebase decided on; calling `api.get()` inside a `useEffect` is the one
 * most pages actually do. Measured 2026-09-03 across 174 pages:
 *
 *   12  use hooks/api or react-query
 *  108  call api.* directly, with no hook
 *
 * The item is explicit that this is NOT a big-bang rewrite: migrate the
 * highest-churn pages first, and make new or touched pages use `hooks/api/`.
 * That is what a ratchet is for. Nobody has to migrate anything to keep this
 * green; a page that is REWRITTEN in the old style turns it red.
 *
 * What the hand-rolled style actually costs, so this reads as more than
 * consistency: no request dedupe (two components mounting the same page fetch
 * twice), no cache (a back-navigation refetches everything), no shared
 * retry/backoff, and every page inventing its own loading and error state --
 * which is also how QF-05's silent-empty-section pattern spreads.
 *
 * MIGRATION HAS STARTED. Four of the highest-churn SIS pages now read through
 * hooks/api: RosterPage (19 commits in six months), StaffPage (16),
 * HouseholdsPage (18), TeacherClassPage (15). Their hooks are
 * useSisRoster/useSisStaff/useSisHouseholds/useSisTeacherClass, and each keys
 * on orgId so a superadmin switching orgs cannot be served the previous org's
 * rows from cache. 555 call sites -> 540, 12 hooked pages -> 16.
 *
 * COUNTED IN CALL SITES, NOT FILES, since 2026-09-04. The file count is not
 * the quantity anyone cares about and it moves for reasons that have nothing
 * to do with this item: splitting ClassesPage into seven components (QF-02)
 * took the file tally from 108 to 118 without adding a single fetch. Call
 * sites are invariant under a pure move -- 62 before those splits, 62 after,
 * checked -- and they are what actually migrates when a page moves to a hook.
 * The file tally is still reported, as information rather than as the gate.
 */

const PAGES = path.resolve(__dirname, '../pages')
const COMPONENTS = path.resolve(__dirname, '../components')

/**
 * Measured 2026-09-04. Ratchet DOWN as pages migrate.
 *
 * 540 -> 542 on 2026-09-05, merging origin/main into audit/remediation-2026-08.
 * Both calls are in sis/MyTasksPage.jsx (6 -> 8), added by ticket b9583855
 * (multiple document attachments on onboarding items): a PATCH to save an
 * onboarding item and a GET for a signed document URL. They were written on
 * main while this ratchet existed only on this branch, so no rule was in place
 * to route them through hooks/api -- raised rather than treated as a
 * regression, because a gate cannot be broken by code that predates it
 * reaching that branch. MyTasksPage is now the obvious next migration
 * candidate at 8 call sites.
 *
 * 542 -> 545 on 2026-09-05, three iCreate Perch tickets. Each new call sits
 * directly beside an identical hand-rolled twin in the same function, and
 * hooking only the new half would leave one feature fetching two ways:
 *   * sis/ClassesPage.jsx (+2) — GET /api/sis/room-schedule in `load` and in
 *     `warnIfRoomDoubleBooked`, the room double-booking check (43625a45,
 *     f9d50612). Both are line-for-line the teacher-conflicts calls above
 *     them, which this page has fetched by hand since that check shipped.
 *   * sis/OnboardingPage.jsx (+1) — GET .../attachable-documents, so the
 *     office can file an already-uploaded document against the checklist item
 *     it answers (c23105fa). Its neighbour, the doc-url GET, is hand-rolled.
 * ClassesPage and OnboardingPage are both migration candidates; migrating
 * either takes its whole set of calls, not these three.
 *
 * 545 -> 549 later the same day, the rest of that sweep. Each is a new control
 * on a page that already fetches by hand, and hooking one call on a page whose
 * other eight are hand-rolled would leave the page fetching two ways:
 *   * sis/CommunityPage.jsx (+3) — replies under a shout-out: read the thread,
 *     post one, take one back (d0c7ac4e).
 *   * sis/ResourcesPage.jsx (+1) — the staff a resource can be pinned to by
 *     name (cf671ff2).
 * The RSVP and substitute-sheet work went into components/ rather than pages/,
 * which this census does not walk, so neither shows up here.
 *
 * 549 -> 469 on 2026-09-07, the second migration batch (QF-03). Four more
 * pages read through hooks/api, chosen by churn as the item says:
 *
 *   sis/ClassesPage.jsx        44 commits/6mo, 21 call sites  useSisClasses
 *   sis/StudentDetailModal.jsx 24 commits,     23 call sites  useSisStudentDetail
 *   sis/FamilyDetailModal.jsx  19 commits,     19 call sites  useSisFamilyDetail
 *   sis/OnboardingPage.jsx     20 commits,     17 call sites  useSisOnboarding
 *
 * Three of those hook modules also removed a duplicate fetch that the
 * hand-rolled style had made invisible -- two panels of one drawer asking for
 * the same URL, on screen at the same time. See each module's header.
 *
 * ScheduleBuilderPage (27 commits, 13 call sites) was skipped despite being
 * second by churn: its staff preview mode keeps the schedule in memory and
 * mutates it locally, so the same state is a fetched query in one mode and a
 * scratchpad in the other. That is a design decision, not a mechanical
 * migration, and it is the family-facing scheduling flow.
 *
 * THE TAIL IS DECLINED, NOT DEFERRED (2026-09-07, owner's decision). 469 call
 * sites across 111 pages is the accepted steady state, the same disposition
 * QB-06 gave the repository pattern and for the same reason: what finishing
 * would buy is consistency, and the price is out of proportion to it.
 *
 * So this file is now the whole of the policy. New and rewritten pages go
 * through hooks/api/ -- that is what the baseline below enforces -- and an
 * existing hand-rolled page is migrated only when something else brings a
 * session into it. Nobody is behind on anything.
 *
 * REOPENED ONCE, on 2026-09-09, on the owner's instruction: one more batch and
 * a wider census. The disposition above still stands for the tail -- what
 * changed is that the tail was being measured in one directory out of two, and
 * that the largest single hand-rolled surface left (CommunityPage, 20 call
 * sites) turned out to be hiding a staleness bug. See the entry below the
 * baseline. "Declined" means nobody is behind on the remainder; it does not
 * mean the file is closed to a batch somebody decides is worth it.
 *
 * The case against finishing, recorded so it is not re-argued from scratch:
 * the two batches that ARE done took the pages where the missing cache cost
 * something -- the highest-churn page in the console (44 commits in six
 * months) and three drawers the office reopens all day. The rest average four
 * call sites and single-digit churn, so most would gain a cache nobody returns
 * to and a dedupe with nothing to dedupe. Each also costs a
 * QueryClientProvider in every test that renders it: ten test files for four
 * pages last time, and that price does not fall as the pages get smaller.
 */
// 469 -> 470 on 2026-09-07, merging ticket/d4bc2603. One PUT on
// FamilyBillingPage for the family's tuition payment-plan preference. The page
// has eight hand-rolled calls already and is not on the migrated list, so
// hooking this one would leave a single page fetching two ways -- the same
// judgement the entries above record.
//
// ── 2026-09-09: THE CENSUS NOW COVERS components/ AS WELL ────────────────────
//
// It always should have. pages/ was 465 call sites on this date and
// components/ was 536 -- more than half the hand-rolled fetching in the app was
// outside the only directory being measured, and a page could get greener by
// moving a fetch one directory sideways. QF-02 does exactly that kind of move
// for a living: fifteen components over 1,000 lines were split into
// thirty-one, and several of those splits pushed fetches from pages/ into
// components/.
//
// The two halves are reported separately and gated together. Together, because
// which directory a fetch sits in is not the quantity anyone cares about;
// separately, because when this does go red the first question is which half
// moved.
//
// 1001 -> 981 on 2026-09-09. sis/CommunityPage.jsx, 20 call sites across seven
// components -- the largest hand-rolled surface left. Its hook module is
// hooks/api/useSisCommunity. Migrating it turned up a real staleness bug that
// neither file could show on its own: the Highlights tab is a server-side
// DIGEST of the other four tabs (/api/sis/community/highlights returns the same
// announcements, events, lost & found and shout-outs), and posting an
// announcement refreshed the Announcements tab's useState and nothing else. Go
// back to Highlights and it still showed the old digest. Every community
// mutation now invalidates the whole community subtree, so the digest and the
// tab that feeds it cannot disagree.
//
// One thing deliberately NOT migrated inside that page: the comment thread
// under a shout-out. It is collapsed until opened, and once open the page shows
// a live local list so a comment just posted is counted without a refetch.
// Under a query that becomes invalidate-and-refetch on every post -- a round
// trip in place of an instant append, on the interaction people repeat most.
//
// A NOTE ON THE RAW NUMBER. A census of every `api.*` in pages/ and components/
// -- .js files included, and files that already read through hooks/api included
// -- gives a larger figure (1,095 on 2026-09-09, before this migration). This
// ratchet deliberately counts neither: a module of nothing but endpoint path
// literals (pages/admin/crm/crmApi.js, 23 of them, checked against the Flask
// url_map by backend/tests/test_client_api_paths_exist.py) is the thing
// hooks/api CALLS, not a page fetching by hand, and a page that has migrated is
// not made hand-rolled again by one imperative call left in a modal.
const CALL_SITE_BASELINE = 981
const SLACK = 40

const USES_HOOK = /useQuery|useMutation|hooks\/api/
const CALLS_API = /\bapi\.(get|post|put|patch|delete)\s*\(/

function sourceFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue
      sourceFiles(full, acc)
    } else if (/\.jsx$/.test(entry.name) && !/\.test\.jsx$/.test(entry.name)) {
      acc.push(full)
    }
  }
  return acc
}

const CALLS_API_ALL = /\bapi\.(get|post|put|patch|delete)\s*\(/g

function census(dir) {
  let hooked = 0
  let callSites = 0
  const handRolled = []
  for (const file of sourceFiles(dir)) {
    const body = fs.readFileSync(file, 'utf8')
    if (USES_HOOK.test(body)) hooked += 1
    else if (CALLS_API.test(body)) handRolled.push(path.relative(dir, file))
    if (!USES_HOOK.test(body)) callSites += (body.match(CALLS_API_ALL) || []).length
  }
  return { hooked, handRolled, callSites }
}

/** pages/ and components/ together -- see the header for why both. */
function total() {
  const pages = census(PAGES)
  const components = census(COMPONENTS)
  return {
    pages,
    components,
    callSites: pages.callSites + components.callSites,
    files: pages.handRolled.length + components.handRolled.length,
  }
}

describe('data-fetching paradigm', () => {
  it('is looking at real files', () => {
    // This shape of test regresses by globbing nothing and passing forever.
    expect(sourceFiles(PAGES).length).toBeGreaterThan(100)
    expect(sourceFiles(COMPONENTS).length).toBeGreaterThan(300)
  })

  it('hand-rolled fetches do not multiply', () => {
    const { callSites, files, pages, components } = total()
    expect(
      callSites,
      `${callSites} hand-rolled api.* call sites across ${files} files `
      + `(pages ${pages.callSites}, components ${components.callSites}), `
      + `baseline ${CALL_SITE_BASELINE}. New and rewritten pages and components `
      + 'belong in hooks/api/ -- the hand-rolled style has no request dedupe, no '
      + 'cache, no shared retry, and reinvents loading and error state every '
      + 'time.\n\n'
      + 'Splitting a file does NOT move this number, and neither does moving a '
      + 'fetch between pages/ and components/: the same calls in more files '
      + 'count the same. If this went up, a fetch was added.',
    ).toBeLessThanOrEqual(CALL_SITE_BASELINE)
  })

  it('has a baseline that still means something', () => {
    const { callSites } = total()
    expect(
      callSites,
      `Only ${callSites} hand-rolled call sites against a baseline of `
      + `${CALL_SITE_BASELINE}. Lower CALL_SITE_BASELINE to ${callSites}.`,
    ).toBeGreaterThan(CALL_SITE_BASELINE - SLACK)
  })

  it('counts both halves, not just pages', () => {
    // The census covered only pages/ until 2026-09-09, which meant more than
    // half the hand-rolled fetching in the app was unmeasured AND that moving a
    // fetch one directory sideways read as an improvement. If components/ ever
    // drops out of the count again, this says so instead of the number quietly
    // halving and looking like progress.
    const { components } = total()
    expect(components.callSites).toBeGreaterThan(100)
  })

  it('the hooks/api directory it points people at still exists', () => {
    // The ratchet names a destination. If that directory were ever removed the
    // message would be telling people to migrate into nothing.
    const hooksApi = path.resolve(__dirname, '../hooks/api')
    expect(fs.existsSync(hooksApi)).toBe(true)
    expect(fs.readdirSync(hooksApi).length).toBeGreaterThan(5)
  })
})
