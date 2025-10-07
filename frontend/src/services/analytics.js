import ReactGA from 'react-ga4';

const MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID;

// Initialize GA4
export const initGA = () => {
  if (MEASUREMENT_ID && import.meta.env.PROD) {
    ReactGA.initialize(MEASUREMENT_ID, {
      gaOptions: {
        anonymize_ip: true, // GDPR compliance
      },
    });
  } else {
  }
};

// Track page views
export const trackPageView = (path, title) => {
  if (MEASUREMENT_ID && import.meta.env.PROD) {
    ReactGA.send({ hitType: 'pageview', page: path, title });
  }
};

// Track custom events
export const trackEvent = (category, action, label = '', value = 0) => {
  if (MEASUREMENT_ID && import.meta.env.PROD) {
    ReactGA.event({
      category,
      action,
      label,
      value,
    });
  }
};

// Set user properties
export const setUserProperties = (user) => {
  if (MEASUREMENT_ID && import.meta.env.PROD) {
    ReactGA.set({
      user_tier: user.subscription_tier,
      user_level: user.level,
      user_id: user.id, // For user-level analysis
    });
  }
};

// User events
export const trackSignup = (method = 'email') => {
  trackEvent('User', 'Sign Up', method);
};

export const trackLogin = (user) => {
  setUserProperties(user);
  trackEvent('User', 'Login', user.subscription_tier);
};

export const trackLogout = () => {
  trackEvent('User', 'Logout');
};

// Quest events
export const trackQuestStarted = (questId, questTitle) => {
  trackEvent('Quest', 'Started', questTitle);
};

export const trackQuestCompleted = (questId, questTitle, xpEarned) => {
  trackEvent('Quest', 'Completed', questTitle, xpEarned);
};

export const trackQuestAbandoned = (questId, questTitle) => {
  trackEvent('Quest', 'Abandoned', questTitle);
};

export const trackTaskCompleted = (taskId, questTitle, xpEarned) => {
  trackEvent('Task', 'Completed', questTitle, xpEarned);
};

// Subscription events
export const trackSubscriptionStarted = (tier) => {
  trackEvent('Subscription', 'Started', tier);
};

export const trackSubscriptionCompleted = (tier, amount) => {
  trackEvent('Subscription', 'Completed', tier, amount);
};

export const trackSubscriptionCancelled = (tier) => {
  trackEvent('Subscription', 'Cancelled', tier);
};

export const trackSubscriptionUpgraded = (fromTier, toTier) => {
  trackEvent('Subscription', 'Upgraded', `${fromTier} to ${toTier}`);
};

// Social features
export const trackFriendRequestSent = () => {
  trackEvent('Social', 'Friend Request Sent');
};

export const trackFriendRequestAccepted = () => {
  trackEvent('Social', 'Friend Request Accepted');
};

export const trackCollaborationStarted = (questTitle) => {
  trackEvent('Social', 'Collaboration Started', questTitle);
};

export const trackCollaborationInviteSent = (questTitle) => {
  trackEvent('Social', 'Collaboration Invite Sent', questTitle);
};

// Evidence submission
export const trackEvidenceSubmitted = (type) => {
  trackEvent('Evidence', 'Submitted', type);
};

// Diploma events
export const trackDiplomaViewed = (userId, isOwner) => {
  trackEvent('Diploma', 'Viewed', isOwner ? 'Own' : 'Public');
};

export const trackDiplomaShared = (platform) => {
  trackEvent('Diploma', 'Shared', platform);
};

export const trackDiplomaDownloaded = () => {
  trackEvent('Diploma', 'Downloaded');
};

// AI Tutor events
export const trackTutorMessageSent = (mode) => {
  trackEvent('Tutor', 'Message Sent', mode);
};

export const trackTutorConversationStarted = (mode) => {
  trackEvent('Tutor', 'Conversation Started', mode);
};

// Error tracking
export const trackError = (errorType, errorMessage) => {
  trackEvent('Error', errorType, errorMessage);
};

// Search events
export const trackSearch = (query, resultsCount) => {
  trackEvent('Search', 'Quest Search', query, resultsCount);
};

// Profile events
export const trackProfileUpdated = () => {
  trackEvent('Profile', 'Updated');
};

export const trackAvatarUploaded = () => {
  trackEvent('Profile', 'Avatar Uploaded');
};

export default {
  initGA,
  trackPageView,
  trackEvent,
  setUserProperties,
  trackSignup,
  trackLogin,
  trackLogout,
  trackQuestStarted,
  trackQuestCompleted,
  trackQuestAbandoned,
  trackTaskCompleted,
  trackSubscriptionStarted,
  trackSubscriptionCompleted,
  trackSubscriptionCancelled,
  trackSubscriptionUpgraded,
  trackFriendRequestSent,
  trackFriendRequestAccepted,
  trackCollaborationStarted,
  trackCollaborationInviteSent,
  trackEvidenceSubmitted,
  trackDiplomaViewed,
  trackDiplomaShared,
  trackDiplomaDownloaded,
  trackTutorMessageSent,
  trackTutorConversationStarted,
  trackError,
  trackSearch,
  trackProfileUpdated,
  trackAvatarUploaded,
};