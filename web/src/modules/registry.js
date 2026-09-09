/**
 * Display metadata for the building blocks -- names, categories, and the
 * marketing blocks each module presents as. Gating fields live in
 * moduleKeys.json (held in lockstep with the Python registry by
 * backend/tests/unit/test_module_registry.py); this file is what the
 * Blocks panel and nav render from. Nav paths and icons join here as the
 * chrome adopts the registry.
 */

export const CATEGORIES = ["learning", "credentials", "ai", "people", "operations", "community"]

export const MODULE_INFO = {
  ai: { name: "AI Tools", category: "ai", blocks: ["AI Tutor", "Lesson Helper", "Task Suggestions", "Course Generator", "Curriculum Upload"] },
  attendance: { name: "Attendance", category: "operations", blocks: ["Attendance", "Accountability Board"] },
  billing: { name: "Tuition & Invoicing", category: "operations", blocks: ["Tuition & Invoicing"] },
  bounties: { name: "Bounty Board", category: "learning", blocks: ["Bounty Board"] },
  calendar: { name: "School Calendar", category: "community", blocks: ["School Calendar"] },
  catalog: { name: "Catalog Widgets", category: "people", blocks: ["Catalog Widgets"] },
  classes: { name: "Classes & Scheduling", category: "operations", blocks: ["Classes & Scheduling", "Schedule Assistant"] },
  clp: { name: "Learning Plans", category: "people", blocks: ["Learning Plans"] },
  community: { name: "Community Hub", category: "community", blocks: ["Community Hub", "Family Directory"] },
  course_builder: { name: "Course Builder", category: "learning", blocks: ["Course Builder"] },
  courses: { name: "Courses & Lessons", category: "learning", blocks: ["Courses & Lessons"] },
  credits: { name: "Credits", category: "credentials", blocks: ["Credit Tracking", "Transfer Credits", "Credit Review"] },
  curriculum: { name: "Curriculum Library", category: "learning", blocks: [] },
  forms: { name: "Forms & Requests", category: "operations", blocks: ["Forms & Requests"] },
  goals: { name: "Goals", category: "people", blocks: [] },
  journal: { name: "Learning Journal", category: "learning", blocks: ["Learning Journal"] },
  kiosk: { name: "Kiosk Check-In", category: "operations", blocks: ["Kiosk Check-In"] },
  messaging: { name: "Messaging & Announcements", category: "community", blocks: ["Announcements", "Messaging"] },
  observer: { name: "Observer Access", category: "community", blocks: ["Observer Access"] },
  onboarding: { name: "Onboarding Checklists", category: "operations", blocks: ["Onboarding Checklists"] },
  portfolio: { name: "Portfolios", category: "learning", blocks: ["Portfolios", "Evidence Reports"] },
  prior_learning: { name: "Prior Learning", category: "credentials", blocks: ["Prior Learning"] },
  quests: { name: "Quests", category: "learning", blocks: ["Quests"] },
  registration: { name: "Registration & Enrollment", category: "people", blocks: ["Registration Builder", "Waitlists & Age Gates", "Schedule Builder"] },
  reports: { name: "Reports & Exports", category: "community", blocks: ["Reports & Exports"] },
  resources: { name: "Resources", category: "operations", blocks: [] },
  secure_documents: { name: "Secure Documents", category: "operations", blocks: ["Secure Documents"] },
  sis: { name: "School Information System", category: "people", blocks: ["Roster & Households", "Student Records", "Five Ways to Add People", "Teacher Dashboards"] },
  submissions: { name: "Submissions Inbox", category: "operations", blocks: ["Submissions Inbox"] },
  tasks: { name: "Task Center", category: "operations", blocks: [] },
  teaching: { name: "Teaching", category: "operations", blocks: ["Advisor Check-Ins", "Teacher Dashboards"] },
  timesheets: { name: "Timesheets", category: "operations", blocks: ["Timesheets"] },
  training: { name: "Staff & Family Training", category: "community", blocks: ["Staff & Family Training"] },
  transcripts: { name: "Accredited Transcripts", category: "credentials", blocks: ["Accredited Transcripts"] },
  xp: { name: "XP & Five Pillars", category: "learning", blocks: ["XP & Five Pillars"] },
}
