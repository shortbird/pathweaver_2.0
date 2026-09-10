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
  },

  // Quest-related queries
  quests: {
    all: ['quests'],
    list: (filters) => [...queryKeys.quests.all, 'list', filters],
    detail: (questId) => [...queryKeys.quests.all, 'detail', questId],
    progress: (userId, questId) => [...queryKeys.quests.all, 'progress', userId, questId],
    active: (userId) => [...queryKeys.quests.all, 'active', userId],
    completed: (userId) => [...queryKeys.quests.all, 'completed', userId],
    tasks: (questId) => [...queryKeys.quests.all, 'tasks', questId],
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
    classMaterials: (studentId) => [...queryKeys.family.all, 'classMaterials', studentId],
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

  // Evidence
  evidence: {
    all: ['evidence'],
    task: (taskId) => [...queryKeys.evidence.all, 'task', taskId],
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