import { useStudentOverviewData } from './useStudentOverviewData';

/**
 * Hook to fetch consolidated student overview data for advisor view.
 * Thin wrapper around useStudentOverviewData with the advisor endpoint.
 */
export function useAdvisorStudentOverview(studentId) {
  return useStudentOverviewData(studentId, '/api/advisor/student-overview');
}

export default useAdvisorStudentOverview;
