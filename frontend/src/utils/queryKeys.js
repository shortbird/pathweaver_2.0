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

  // Social features (friends removed March 2026)
  social: {
    all: ['social'],
    activity: (userId) => [...queryKeys.social.all, 'activity', userId],
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

  // Buddy queries
  buddy: {
    all: ['buddy'],
    record: (userId) => [...queryKeys.buddy.all, 'record', userId],
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
  // User mutations
  updateProfile: 'updateProfile',
  updateSettings: 'updateSettings',
  updateSubscription: 'updateSubscription',

  // Bounty mutations
  claimBounty: 'claimBounty',
  submitBountyEvidence: 'submitBountyEvidence',
  createBounty: 'createBounty',
  reviewBounty: 'reviewBounty',
  moderateBounty: 'moderateBounty',

  // Buddy mutations
  createBuddy: 'createBuddy',
  feedBuddy: 'feedBuddy',
  tapBuddy: 'tapBuddy',

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