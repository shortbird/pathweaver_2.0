/**
 * Query Key Factory for React Query
 * Provides consistent query key naming across the application
 */

export const queryKeys = {
  // User-related queries
  user: {
    all: ['user'],
    profile: (userId) => [...queryKeys.user.all, 'profile', userId],
    dashboard: (userId) => [...queryKeys.user.all, 'dashboard', userId],
    settings: (userId) => [...queryKeys.user.all, 'settings', userId],
    subscription: (userId) => [...queryKeys.user.all, 'subscription', userId],
    // Whose rhythm: the signed-in user's, or -- in family scope -- a child's.
    engagement: (scopeId) => [...queryKeys.user.all, 'engagement', scopeId || 'me'],
  },

  // Quest-related queries.
  //
  // `scopeId` is the family scope (contexts/FamilyScopeContext): a parent
  // reading a child's quest gets the CHILD's copy of it from the same URL, so
  // the child has to be in the key or switching children on the family
  // dashboard serves the previous child's tasks from cache. That cross-child
  // bleed is exactly what the old act-as flow hid behind a full page reload.
  // Undefined means the signed-in user's own rows.
  quests: {
    all: ['quests'],
    list: (filters) => [...queryKeys.quests.all, 'list', filters],
    detail: (questId, scopeId) => [...queryKeys.quests.all, 'detail', questId, scopeId || 'me'],
    // Prefix for invalidation: every scope's copy of one quest.
    detailAll: (questId) => [...queryKeys.quests.all, 'detail', questId],
    progress: (userId, questId) => [...queryKeys.quests.all, 'progress', userId, questId],
    active: (userId) => [...queryKeys.quests.all, 'active', userId],
    completed: (userId) => [...queryKeys.quests.all, 'completed', userId],
    tasks: (questId, scopeId) => [...queryKeys.quests.all, 'tasks', questId, scopeId || 'me'],
    engagement: (questId, scopeId) => [...queryKeys.quests.all, 'engagement', questId, scopeId || 'me'],
  },

  // Portfolio/Diploma queries
  portfolio: {
    all: ['portfolio'],
    user: (userId) => [...queryKeys.portfolio.all, 'user', userId],
    public: (slug) => [...queryKeys.portfolio.all, 'public', slug],
    settings: (userId) => [...queryKeys.portfolio.all, 'settings', userId],
  },

  // The family side of a SIS school — what a guardian reads about their own
  // student. Keyed by student rather than by org: a family's students belong to
  // one school each, so there is no org to switch between.
  family: {
    all: ['family'],
    // The parent's own children (hooks/api/useFamilyChildren). Keyed by the
    // parent so a masquerade swap does not serve the previous parent's kids.
    children: (parentId) => [...queryKeys.family.all, 'children', parentId],
    // Where this person is a GUARDIAN (/api/sis/parent/context): the orgs and
    // the students they may act for there (hooks/api/useSchoolContext). One
    // fetch for every family page; each used to make its own. No user in
    // the key: logout clears the cache and masquerade reloads the page.
    sisContext: () => [...queryKeys.family.all, 'sisContext'],
    // Where this person is a MEMBER (/api/sis/school/context): the school's
    // own surfaces, guardian or not. The sidebar and /school read this.
    schoolContext: () => [...queryKeys.family.all, 'schoolContext'],
    // How this family is listed in one school's directory
    // (hooks/api/useDirectoryListing; Family Settings, Directory tab).
    directoryListing: (orgId) => [...queryKeys.family.all, 'directoryListing', orgId],
    // The family's quests with who is on each (hooks/api/useFamilyQuests).
    quests: () => [...queryKeys.family.all, 'quests'],
    // The parent's family photo (hooks/api/useFamilyCover).
    cover: (parentId) => [...queryKeys.family.all, 'cover', parentId],
    // One child's summary for their card on the family dashboard
    // (hooks/api/useFamilyChildren.useChildSummary).
    childSummary: (studentId) => [...queryKeys.family.all, 'childSummary', studentId],
    classMaterials: (studentId) => [...queryKeys.family.all, 'classMaterials', studentId],
    // The signed-in student's own, which takes no id -- see useMyClassMaterials.
    myClassMaterials: () => [...queryKeys.family.all, 'myClassMaterials'],
    // classId narrows to one class; undefined is the whole record.
    attendance: (studentId, classId) =>
      [...queryKeys.family.all, 'attendance', studentId, classId || 'all'],
    studentOrg: (studentId) => [...queryKeys.family.all, 'studentOrg', studentId],
    classes: (studentId) => [...queryKeys.family.all, 'classes', studentId],
  },

  // Social features (friends removed March 2026)
  social: {
    all: ['social'],
    activity: (userId) => [...queryKeys.social.all, 'activity', userId],
  },

  // SIS console. Everything here is org-scoped, so orgId is part of the key --
  // a superadmin switching orgs must not be served the previous org's cache.
  sis: {
    all: ['sis'],
    roster: (orgId) => [...queryKeys.sis.all, 'roster', orgId],
    staff: (orgId) => [...queryKeys.sis.all, 'staff', orgId],
    households: (orgId) => [...queryKeys.sis.all, 'households', orgId],
    teacherClassRoster: (orgId, classId) => [...queryKeys.sis.all, 'teacherClassRoster', orgId, classId],
    // The catalog varies by two flags as well as by org: archived classes are a
    // different list, and a teacher is served a smaller payload than an admin.
    // Both belong in the key, or switching either would read the other's cache.
    classCatalog: (orgId, { showArchived, isAdmin } = {}) =>
      [...queryKeys.sis.all, 'classCatalog', orgId, !!showArchived, !!isAdmin],
    scheduleConflicts: (orgId) => [...queryKeys.sis.all, 'scheduleConflicts', orgId],
    // Who replied to one calendar event. Keyed by event AND org: a superadmin
    // switching schools must not be served the previous school's replies.
    eventRsvps: (eventId, orgId) => [...queryKeys.sis.all, 'eventRsvps', eventId, orgId],
    // Student drawer. studentContacts has no orgId: the endpoint is scoped by
    // the student, and two panels on screen at once share this key so the
    // request is made once.
    studentContacts: (studentId) => [...queryKeys.sis.all, 'studentContacts', studentId],
    studentRecord: (studentId, orgId) => [...queryKeys.sis.all, 'studentRecord', studentId, orgId],
    studentClasses: (studentId, orgId) => [...queryKeys.sis.all, 'studentClasses', studentId, orgId],
    orgClassList: (orgId) => [...queryKeys.sis.all, 'orgClassList', orgId],
    // The Quests page: every quest the org owns and where each is in use.
    questLibrary: (orgId) => [...queryKeys.sis.all, 'questLibrary', orgId],
    householdList: (orgId) => [...queryKeys.sis.all, 'householdList', orgId],
    // Family drawer.
    householdBilling: (id, orgId) => [...queryKeys.sis.all, 'householdBilling', id, orgId],
    householdContacts: (id, orgId) => [...queryKeys.sis.all, 'householdContacts', id, orgId],
    householdRegistration: (id, orgId) => [...queryKeys.sis.all, 'householdRegistration', id, orgId],
    // Onboarding checklists. previewUserId is in the key because an admin
    // previewing somebody else's checklist must not be served their own from
    // cache, or the reverse.
    myOnboarding: (orgId, previewUserId) =>
      [...queryKeys.sis.all, 'myOnboarding', orgId, previewUserId],
    onboardingAssignments: (orgId) => [...queryKeys.sis.all, 'onboardingAssignments', orgId],
    onboardingTemplates: (orgId) => [...queryKeys.sis.all, 'onboardingTemplates', orgId],
    // "Pick a class" on a family recipient list (ticket a19d5660): the class
    // options, and the guardians of one class's enrolled students.
    recipientClasses: (orgId) => [...queryKeys.sis.all, 'recipientClasses', orgId],
    classFamilies: (orgId, classId) => [...queryKeys.sis.all, 'classFamilies', orgId, classId],
    // Community console. `community(orgId)` is the PREFIX every tab's key
    // starts with, so one invalidate after a mutation reaches all of them --
    // which matters because /highlights is a server-side digest of the other
    // four, and posting an announcement has to refresh both the tab and the
    // digest or they disagree on screen.
    community: (orgId) => [...queryKeys.sis.all, 'community', orgId],
    communityHighlights: (orgId) => [...queryKeys.sis.community(orgId), 'highlights'],
    communityAnnouncements: (orgId) => [...queryKeys.sis.community(orgId), 'announcements'],
    communityLostFound: (orgId) => [...queryKeys.sis.community(orgId), 'lostFound'],
    communityRecognition: (orgId) => [...queryKeys.sis.community(orgId), 'recognition'],
    communityMembers: (orgId) => [...queryKeys.sis.community(orgId), 'members'],
    communityEvents: (orgId) => [...queryKeys.sis.community(orgId), 'events'],
  },

  // Evidence. scopeId as on quests: a child's document, not the parent's.
  evidence: {
    all: ['evidence'],
    task: (taskId, scopeId) => [...queryKeys.evidence.all, 'task', taskId, scopeId || 'me'],
  },

  // Course queries
  courses: {
    all: ['course'],
    list: (filters) => [...queryKeys.courses.all, 'list', filters],
    homepage: (courseId) => [...queryKeys.courses.all, 'homepage', courseId],
    detail: (courseId) => [...queryKeys.courses.all, 'detail', courseId],
    progress: (courseId) => [...queryKeys.courses.all, 'progress', courseId],
  },

  // Bounty queries
  bounties: {
    all: ['bounties'],
    list: (filters) => [...queryKeys.bounties.all, 'list', filters],
    detail: (bountyId) => [...queryKeys.bounties.all, 'detail', bountyId],
    myClaims: ['bounties', 'my-claims'],
    myPosted: ['bounties', 'my-posted'],
  },

  // Admin queries
  admin: {
    all: ['admin'],
    users: (filters) => [...queryKeys.admin.all, 'users', filters],
    quests: (filters) => [...queryKeys.admin.all, 'quests', filters],
    analytics: (timeRange) => [...queryKeys.admin.all, 'analytics', timeRange],
    // The ticket tracker (/admin/tickets). `tickets.all` is the invalidation
    // root: an edit to one ticket moves it between tabs and changes the counts.
    tickets: {
      all: ['admin', 'tickets'],
      list: (filters) => [...queryKeys.admin.tickets.all, 'list', filters],
      detail: (ticketId) => [...queryKeys.admin.tickets.all, 'detail', ticketId],
      summary: () => [...queryKeys.admin.tickets.all, 'summary'],
    },
    // Feed items bookmarked in the app for a story (/admin/stories queue).
    storyCandidates: (status) => [...queryKeys.admin.all, 'story-candidates', status],
    // Optio's own invoices (/admin/billing). `billing.all` is the invalidation
    // root; the list is keyed by the org filter ('' = every invoice).
    billing: {
      all: ['admin', 'billing'],
      invoices: (orgId) => [...queryKeys.admin.billing.all, 'invoices', orgId || ''],
      orgs: () => [...queryKeys.admin.billing.all, 'orgs'],
    },
  },

  // Utility functions
  invalidateUser: (queryClient, userId) => {
    queryClient.invalidateQueries(queryKeys.user.all)
    if (userId) {
      queryClient.invalidateQueries(queryKeys.quests.active(userId))
      queryClient.invalidateQueries(queryKeys.quests.completed(userId))
      queryClient.invalidateQueries(queryKeys.portfolio.user(userId))
      queryClient.invalidateQueries(queryKeys.social.activity(userId))
    }
  },

  invalidateQuests: (queryClient, userId) => {
    queryClient.invalidateQueries(queryKeys.quests.all)
    // Also invalidate courses since quest progress affects course XP
    queryClient.invalidateQueries(queryKeys.courses.all)
    if (userId) {
      queryClient.invalidateQueries(queryKeys.user.dashboard(userId))
      queryClient.invalidateQueries(queryKeys.portfolio.user(userId))
    }
  },

  // Everything that reads as "whose rows": called when the family scope
  // changes so nothing from the previous child survives the switch.
  invalidateScoped: (queryClient) => {
    queryClient.invalidateQueries(queryKeys.user.all)
    queryClient.invalidateQueries(queryKeys.quests.all)
    queryClient.invalidateQueries(queryKeys.evidence.all)
    queryClient.invalidateQueries(queryKeys.portfolio.all)
  },

  invalidateCourses: (queryClient) => {
    queryClient.invalidateQueries(queryKeys.courses.all)
  },

  invalidateSocial: (queryClient, userId) => {
    queryClient.invalidateQueries(queryKeys.social.all)
    if (userId) {
      queryClient.invalidateQueries(queryKeys.user.dashboard(userId))
    }
  },
}

// Helper function to create mutation keys
export const mutationKeys = {
  // Credit review: ask for a fresh AI read of one submission.
  rerunAiReview: 'rerunAiReview',
  // User mutations
  updateProfile: 'updateProfile',
  updateSettings: 'updateSettings',
  updateSubscription: 'updateSubscription',

  // Bounty mutations
  claimBounty: 'claimBounty',
  createBounty: 'createBounty',
  reviewBounty: 'reviewBounty',
  moderateBounty: 'moderateBounty',

  // Quest mutations
  enrollQuest: 'enrollQuest',
  completeTask: 'completeTask',
  submitEvidence: 'submitEvidence',
  abandonQuest: 'abandonQuest',
  endQuest: 'endQuest',
  deleteEnrollment: 'deleteEnrollment',

  // Social mutations
  // Evidence mutations
  uploadEvidence: 'uploadEvidence',
}