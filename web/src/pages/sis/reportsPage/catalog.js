/**
 * Every report the SIS console offers, grouped by the question it answers.
 *
 * Until 2026-09-14 the page was one flat grid of fourteen cards under a
 * heading that said "Information reports" -- medications beside class rosters
 * beside payments -- each with its own Run button, and the answer rendered
 * under the whole grid where nobody was looking. This is the same set of
 * reports as a list you pick from, with the one you picked, its options and
 * its output on the right.
 *
 * `autoRun`: a report with nothing to choose runs the moment it is picked.
 * The ones that need a choice (which classes, which question) wait for it.
 * `money`: finance tier only; the campus coordinator never sees it listed.
 */

export const GROUPS = [
  { key: 'overview', label: 'Overview' },
  { key: 'rosters', label: 'Rosters & schedules' },
  { key: 'health', label: 'Health & safety' },
  { key: 'attendance', label: 'Attendance' },
  { key: 'families', label: 'Families' },
  { key: 'registration', label: 'Registration' },
  { key: 'money', label: 'Money' },
]

export const REPORTS = [
  {
    key: 'overview', group: 'overview', title: 'At a glance', autoRun: false,
    description: 'How many students are in classes, how attendance is running, and what has been billed and collected.',
  },
  {
    key: 'rosters', group: 'rosters', title: 'Class rosters', autoRun: false,
    description: 'Students across as many classes as you like, in one sheet. Pick the classes, then the columns.',
  },
  {
    key: 'day-rosters', group: 'rosters', title: 'Day rosters', autoRun: true,
    description: 'One sheet per day: each block, the classes running in it, the room, and who should be in each. For the person who has to tell a child where to go.',
  },
  {
    key: 'block-rosters', group: 'rosters', title: 'Block rosters', autoRun: true,
    description: 'One page per block: every class running in it side by side, with its room and each student’s age. Pick a day, print a block, or download the grid.',
  },
  {
    key: 'student-schedule', group: 'rosters', title: 'Student schedule', autoRun: true,
    description: 'Every student with their age, which days they come, and which block they are in each day.',
  },
  {
    key: 'classes', group: 'rosters', title: 'Class list', autoRun: true,
    description: 'One row per class: teacher, days and time, room, tuition, supply fee, curriculum, and more. Pick the columns after it runs.',
  },
  {
    key: 'medications', group: 'health', title: 'Medications', autoRun: true,
    description: 'Every student who needs a medication, with schedule notes, parent contact, and emergency contact.',
  },
  {
    key: 'allergies', group: 'health', title: 'Allergies', autoRun: true,
    description: 'Every student with a recorded allergy, with notes, parent contact, and emergency contact.',
  },
  {
    key: 'emergency-contacts', group: 'health', title: 'Emergency contacts', autoRun: true,
    description: 'Every student with the guardians in their household and the emergency contacts named for them, and a Missing column naming whoever is still not on file. Built to print.',
  },
  {
    key: 'media-release', group: 'health', title: 'Media release', autoRun: true,
    description: 'Which families have given photo and media consent, and which have not.',
  },
  {
    key: 'daily-attendance', group: 'attendance', title: 'Daily attendance', autoRun: true,
    description: 'Who was present, absent, late or excused on one day, class by class.',
  },
  {
    // P7, iCreate 2026-09-23: "verify whether the assigned teacher taught a
    // class or a substitute did" -- for a pay period, not only today.
    key: 'roll-call', group: 'attendance', title: 'Who took roll', autoRun: false,
    description: 'Every class for a range of days: who took the roll and when, whether that was the class’s teacher, and any substitute. For checking a pay period.',
  },
  {
    // iCreate (Katrine Myers), ticket 1a54e05a: families asking about
    // carpooling, and no way to see who lives near whom.
    key: 'family-locations', group: 'families', title: 'Where families live', autoRun: true,
    description: 'Families counted by city, with who said they want to carpool. Open a city to see its families. Staff only.',
  },
  {
    key: 'question', group: 'registration', title: 'Registration answers', autoRun: false,
    description: 'Every family’s (or student’s) answer to one registration question. Filter by the answer, city, form of payment, child age, or days per week, and sort by family, age, or city.',
  },
  {
    key: 'checklist-completion', group: 'registration', title: 'Task completion', autoRun: true,
    description: 'Who has finished the tasks the school assigned, and who still has steps open.',
  },
  {
    key: 'payments', group: 'money', title: 'Payments', autoRun: true, money: true,
    description: 'Every payment you have recorded, with the split by method: card, check, cash, scholarship.',
  },
]

export const reportByKey = (key) => REPORTS.find((r) => r.key === key) || REPORTS[0]

export const visibleReports = (seesMoney) => REPORTS.filter((r) => seesMoney || !r.money)
