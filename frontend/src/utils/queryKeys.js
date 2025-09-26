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

  // Social features (friends & collaborations)
  social: {
    all: ['social'],
    friends: (userId) => [...queryKeys.social.all, 'friends', userId],
    friendRequests: (userId) => [...queryKeys.social.all, 'friendRequests', userId],
    collaborations: (userId) => [...queryKeys.social.all, 'collaborations', userId],
    questCollaborations: (questId) => [...queryKeys.social.all, 'questCollaborations', questId],
  },

  // Evidence
  evidence: {
    all: ['evidence'],
    task: (taskId) => [...queryKeys.evidence.all, 'task', taskId],
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
      queryClient.invalidateQueries(queryKeys.social.friends(userId))
    }
  },

  invalidateQuests: (queryClient, userId) => {
    queryClient.invalidateQueries(queryKeys.quests.all)
    if (userId) {
      queryClient.invalidateQueries(queryKeys.user.dashboard(userId))
      queryClient.invalidateQueries(queryKeys.portfolio.user(userId))
    }
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

  // Quest mutations
  enrollQuest: 'enrollQuest',
  completeTask: 'completeTask',
  submitEvidence: 'submitEvidence',
  abandonQuest: 'abandonQuest',

  // Social mutations
  sendFriendRequest: 'sendFriendRequest',
  acceptFriendRequest: 'acceptFriendRequest',
  declineFriendRequest: 'declineFriendRequest',
  sendCollaboration: 'sendCollaboration',
  acceptCollaboration: 'acceptCollaboration',

  // Evidence mutations
  uploadEvidence: 'uploadEvidence',
}