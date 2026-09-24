import { NAV_SECTIONS } from '../../components/sis/SisSidebar'
import { REPORTS } from './reportsPage/catalog'
import { navItemVisible } from './sisNavVisibility'

/**
 * Everything the header search can take somebody to.
 *
 * The console's pages are the sidebar (NAV_SECTIONS); beneath them are the
 * places a page holds as tabs, lenses, reports and cards, which is what people
 * actually look for -- "announcements" is a tab of Messaging, "rooms" a card
 * on Settings, "medications" a report. Nothing in the nav says so, and after
 * the 2026-09-17 merges (five class pages into one, six task pages into one)
 * the nav says even less. Type the word, land on the thing.
 *
 * Every entry below sits `under` a nav path and inherits that page's gates
 * (adminOnly, financeOnly, a module the org turned off ...) through
 * navItemVisible, the same predicate the sidebar filters on. An entry may add
 * gates of its own: the Attendance tab is admin-only on a page every teacher
 * has, and its module can be off separately. What the search offers is what
 * the person can open; the backend is the real gate either way.
 *
 * `to` is the full destination, query string and hash included. A test pins
 * every pathname here to a route in SisRoutes.jsx.
 */

const settingsCard = (key, name, keywords, extra = {}) => ({
  name, keywords, to: `/settings#settings-${key}`, ...extra,
})

export const SUB_ENTRIES = [
  // Messaging. The tab keys are SchoolInboxPage's. Announcements are not
  // here: they live on the Community page (9a335881), below.
  { under: '/inbox', name: 'School inbox', to: '/inbox?tab=school', adminOnly: true, keywords: ['office inbox', 'threads', 'replies', 'waiting', 'compose', 'message families', 'message a class'] },
  { under: '/inbox', name: 'My messages', to: '/inbox?tab=mine', keywords: ['direct messages', 'dm', 'threads', 'conversations'] },
  { under: '/inbox', name: 'Sent messages', to: '/inbox?tab=sent', adminOnly: true, keywords: ['read receipts', 'who read it', 'sent', 'outbox'] },

  // Classes. The tab keys are ClassesPage's; the two office tabs carry their
  // old paths' modules so an org that hid them stays hidden.
  { under: '/classes', name: 'My classes', to: '/classes?tab=mine', keywords: ['teach', 'my students', 'class page', 'quest builder'] },
  { under: '/classes', name: 'My schedule', to: '/classes?tab=schedule', keywords: ['my week', 'timetable', 'when do I teach'] },
  { under: '/classes', name: 'Submissions', to: '/classes?tab=submissions', path: '/submissions', keywords: ['student work', 'review', 'grade', 'evidence', 'turned in'] },
  { under: '/classes', name: 'Class catalog', to: '/classes?tab=all', adminOnly: true, keywords: ['all classes', 'create class', 'new class', 'rosters', 'enroll in class'] },
  { under: '/classes', name: 'Optio courses', to: '/classes?tab=courses', adminOnly: true, keywords: ['online courses', 'course library'] },
  { under: '/classes', name: 'Attendance', to: '/classes?tab=attendance', adminOnly: true, path: '/attendance', keywords: ['present', 'absent', 'roll call', 'check in', 'late', 'excused'] },

  // Tasks. The tab keys are TasksPage's. My documents and Secure documents (the
  // HR store) moved to the Library's Documents area on 2026-09-24.
  { under: '/tasks', name: 'My tasks', to: '/tasks', keywords: ['to do', 'waiting on me', 'onboarding', 'sign'] },
  { under: '/tasks', name: 'Assigned tasks', to: '/tasks?tab=assigned', adminOnly: true, keywords: ['assign a task', 'who owes what', 'assignments', 'repeating tasks', 'daily tasks', 'onboarding'] },
  { under: '/tasks', name: 'Task templates', to: '/tasks?tab=templates', adminOnly: true, keywords: ['templates', 'saved tasks', 'onboarding templates'] },

  // People. Filters live in the URL (PeoplePage), so a lens is a link.
  { under: '/people', name: 'Students', to: '/people?role=student', keywords: ['student list', 'kids', 'learners', 'enrolled'] },
  { under: '/people', name: 'Parents', to: '/people?role=parent', keywords: ['guardians', 'parent list'] },
  { under: '/people', name: 'Staff', to: '/people?role=staff', keywords: ['teachers', 'advisors', 'employees', 'coordinators', 'admins', 'link staff account'] },
  { under: '/people', name: 'Families', to: '/people?family=in', keywords: ['households', 'family list'] },
  { under: '/people', name: 'Students without a family', to: '/people?role=student&family=none', keywords: ['no household', 'orphaned students', 'not in a family'] },
  { under: '/people', name: 'Former students and families', to: '/people?former=1', keywords: ['withdrawn', 'archived', 'left', 'alumni'] },

  // Registration. Setup is the page itself; the queues are the other tab.
  { under: '/registration', name: 'Registration form', to: '/registration', keywords: ['funnel', 'questions', 'setup', 'registration link', 'edit registration'] },
  { under: '/registration', name: 'Enrollment queues', to: '/registration?tab=queues', keywords: ['pending', 'approve', 'waitlist', 'new families', 'applications'] },

  // Billing (M23). The tab keys are BillingPage's; Charges is the page itself.
  { under: '/billing', name: 'To invoice', to: '/billing?tab=invoice', keywords: ['tuition', 'tuition queue', 'approve tuition', 'send invoice', 'clp done', 'waiting on invoice'] },
  { under: '/billing', name: 'Charges', to: '/billing', keywords: ['ledger', 'add charge', 'record payment', 'paid'] },
  { under: '/billing', name: 'Outstanding', to: '/billing?tab=outstanding', keywords: ['overdue', 'who owes', 'balances', 'reminders', 'unpaid'] },
  { under: '/billing', name: 'Monthly tuition', to: '/billing?tab=monthly', keywords: ['recurring', 'monthly rate', 'subscription', 'card on file'] },
  { under: '/billing', name: 'Charge detail', to: '/billing?tab=detail', keywords: ['reconciliation', 'reconcile', 'ufa remittance', 'charge lines', 'csv'] },

  // Library (M22). The tab keys are LibraryPage's; each tab carries its old
  // path's module so an org that hid one stays hidden.
  { under: '/library', name: 'Documents', to: '/library', path: '/resources', keywords: ['resources', 'handbook', 'policies', 'readings', 'acknowledgments', 'family guidebook', 'contract'] },
  { under: '/library', name: 'My documents', to: '/library?tab=documents&docs=mine', path: '/secure-documents', keywords: ['my files', 'signed', 'uploads', 'my paperwork'] },
  { under: '/library', name: 'Secure documents', to: '/library?tab=documents&docs=secure', adminOnly: true, hrOnly: true, path: '/secure-documents', keywords: ['hr', 'contracts', 'background checks', 'confidential', 'personnel files'] },
  { under: '/library', name: 'Training', to: '/library?tab=training', path: '/training', keywords: ['staff training', 'videos', 'modules', 'who has done what', 'orientation'] },
  { under: '/library', name: 'Curriculum', to: '/library?tab=curriculum', adminOnly: true, path: '/curriculum', keywords: ['syllabus', 'materials', 'lesson plans', 'drive folder', 'subjects'] },
  { under: '/library', name: 'Quests', to: '/library?tab=quests', adminOnly: true, path: '/quest-library', keywords: ['quest library', 'projects', 'assign quest', 'new quest'] },

  // Community. The tab keys are CommunityPage's.
  { under: '/community', name: 'Highlights', to: '/community?tab=highlights', keywords: ['community highlights', 'what is new'] },
  { under: '/community', name: 'Announcements', to: '/community?tab=announcements', keywords: ['announce', 'community board', 'post announcement', 'broadcast', 'school wide'] },
  { under: '/community', name: 'Lost and found', to: '/community?tab=lost-found', keywords: ['lost & found', 'missing items', 'found'] },
  { under: '/community', name: 'Recognition', to: '/community?tab=recognition', keywords: ['shout out', 'shout-out', 'spotlight', 'weekly win', 'thank you', 'kudos'] },
  { under: '/community', name: 'Community events', to: '/community?tab=events', keywords: ['upcoming events', 'rsvp'] },
  { under: '/community', name: 'Community resources', to: '/community?tab=resources', keywords: [] },

  // Reports. One entry per report, from the catalog the page renders; the
  // money report is finance-tier there and here.
  ...REPORTS.map((r) => ({
    under: '/reports',
    name: r.title,
    to: r.key === 'overview' ? '/reports' : `/reports?report=${r.key}`,
    financeOnly: Boolean(r.money),
    keywords: [r.key.replace(/-/g, ' '), 'report'],
  })),

  // Settings. One entry per console card (settings/settingsRegistry.jsx),
  // anchored by its key. `path` carries the card's module where it has one.
  { under: '/settings', financeOnly: true, ...settingsCard('org', 'Organization', ['school name', 'logo', 'features', 'ai', 'entitlements', 'prices']) },
  { under: '/settings', ...settingsCard('login-link', 'School login link', ['login url', 'sign in link', 'share link']) },
  { under: '/settings', path: '/classes', ...settingsCard('rooms', 'Classrooms and rooms', ['rooms', 'classrooms', 'spaces', 'locations']) },
  { under: '/settings', path: '/classes', ...settingsCard('time-blocks', 'Class time blocks', ['blocks', 'periods', 'bell schedule', 'time slots']) },
  { under: '/settings', path: '/calendar', ...settingsCard('calendar-categories', 'Calendar categories', ['event types', 'calendar colors']) },
  { under: '/settings', ...settingsCard('quick-links', 'Dashboard quick links', ['shortcuts', 'links on dashboard']) },
  { under: '/settings', path: '/classes', ...settingsCard('parent-digest', 'Parent emails', ['weekly digest', 'parent digest', 'email parents', 'due dates']) },
  { under: '/settings', ...settingsCard('kiosk', 'Kiosk devices', ['kiosk', 'classroom device', 'ipad', 'tablet login']) },
  { under: '/settings', ...settingsCard('help-video', 'Getting-started video', ['help video', 'welcome video', 'tutorial']) },
  { under: '/settings', ...settingsCard('step-printing', 'Printing', ['print', 'step printing', 'worksheets']) },
]

/**
 * The destinations THIS reader may open, flat, in nav order: each page, then
 * what sits under it. `ctx` is navContextFor(user, activeOrg).
 */
export function buildSearchIndex(ctx) {
  const index = []
  for (const section of NAV_SECTIONS) {
    for (const page of section.items) {
      if (!navItemVisible(page, ctx)) continue
      index.push({
        id: page.path,
        name: page.name,
        hint: section.label || '',
        to: page.path,
        keywords: page.keywords || [],
      })
      for (const sub of SUB_ENTRIES) {
        if (sub.under !== page.path) continue
        // The page has already passed its own gates (the `continue` above), so
        // the entry is checked with the page's flags as the base and its own
        // laid over them. `path` here is the ENTRY's module, if it has one --
        // the page's module was settled above, and re-checking it would be
        // harmless but is not what the null means.
        const { under: _under, to, name, keywords, ...gates } = sub
        if (!navItemVisible({ ...page, ...gates, path: gates.path || null }, ctx)) continue
        index.push({
          // Not `to`: a tab that IS its page's default (My tasks, Documents)
          // shares the page's URL, and two entries with one id are two React
          // keys with one value -- the list kept stale rows from the previous
          // keystroke (found on "resources", 2026-09-18).
          id: `${page.path} > ${name}`,
          name,
          hint: `${page.name}${section.label ? ` · ${section.label}` : ''}`,
          to,
          parent: page.name,
          keywords: keywords || [],
        })
      }
    }
  }
  return index
}

const normalize = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9&]+/g, ' ').trim()

/**
 * Rank the index against what was typed. Every word typed has to appear
 * somewhere on an entry (name, keywords or parent page); an entry whose NAME
 * starts with the query outranks one that merely contains it, which outranks
 * a keyword hit, which outranks a hit on the parent's name alone. One
 * exception: a keyword that IS the query beats a name that merely contains
 * it -- a keyword is an alias chosen because people say it ("resources" for
 * the Documents tab), and an incidental substring elsewhere ("Community
 * resources") must not outrank the thing they meant. Ties keep nav order,
 * so "class" lists Classes before its tabs.
 */
export function searchFeatures(index, query, limit = 8) {
  const q = normalize(query)
  if (!q) return []
  const words = q.split(' ')
  const scored = []
  index.forEach((entry, order) => {
    const name = normalize(entry.name)
    const keywords = (entry.keywords || []).map(normalize)
    const parent = normalize(entry.parent)
    const haystack = [name, ...keywords, parent].join(' | ')
    if (!words.every((w) => haystack.includes(w))) return
    let score = 0
    if (name === q) score = 5
    else if (name.startsWith(q)) score = 4
    else if (keywords.includes(q)) score = 3.5
    else if (name.includes(q)) score = 3
    else if (words.every((w) => name.includes(w))) score = 2.5
    else if (keywords.some((k) => k.startsWith(q))) score = 2
    else if (keywords.some((k) => k.includes(q))) score = 1.5
    else if (words.every((w) => keywords.some((k) => k.includes(w)) || name.includes(w))) score = 1
    else score = 0.5
    scored.push({ entry, score, order })
  })
  scored.sort((a, b) => b.score - a.score || a.order - b.order)
  return scored.slice(0, limit).map((s) => s.entry)
}
