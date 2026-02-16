import { useStudentOverviewData } from './useStudentOverviewData';

/**
 * Hook to fetch consolidated child overview data for parent view.
 * Thin wrapper around useStudentOverviewData with the parent endpoint.
 */
export function useParentChildOverview(studentId) {
  return useStudentOverviewData(studentId, '/api/parent/child-overview');
}

export default useParentChildOverview;
