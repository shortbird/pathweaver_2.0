/**
 * API Hooks Index
 *
 * Re-exports all API-related hooks for easy importing.
 *
 * Usage:
 *   import { useCourseBuilder, useLessonManagement, useOrgUsers } from '../hooks/api';
 */

export { useCourseBuilder } from './useCourseBuilder';
export { useLessonManagement } from './useLessonManagement';
export { useOrgUsers } from './useOrgUsers';
export {
  useNotifications,
  useNotificationsQuery,
  useNotificationSubscription,
  useUnreadCount
} from './useNotifications';
export { useAdvisorStudentOverview } from './useAdvisorStudentOverview';
export { useParentChildOverview } from './useParentChildOverview';
export { useStudentOverviewData } from './useStudentOverviewData';
