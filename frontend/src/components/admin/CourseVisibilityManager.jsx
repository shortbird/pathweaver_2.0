import React, { useState, useEffect } from 'react';
import api from '../../services/api';

/**
 * CourseVisibilityManager - Course availability control for organization admins
 *
 * Handles all three course_visibility_policy modes:
 * - all_optio: All global courses available by default
 * - curated: Manual grant/revoke of specific courses
 * - private_only: Only org-created courses available
 */
export default function CourseVisibilityManager({ orgId, orgData, onUpdate, siteSettings }) {
  const [courses, setCourses] = useState([]);
  const [accessibleCourseIds, setAccessibleCourseIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [currentPage, setCurrentPage] = useState(1);
  const coursesPerPage = 25;

  // Get logo URLs
  const optioLogoUrl = siteSettings?.logo_url;

  const policy = orgData?.organization?.course_visibility_policy || 'all_optio';
  const canToggle = policy === 'curated';
  const showOptioCourses = policy !== 'private_only';

  useEffect(() => {
    fetchCourses();
    fetchAccessibleCourses();
  }, [orgId]);

  // Reset to first page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const fetchCourses = async () => {
    try {
      // Fetch all courses for admin visibility management
      // This includes org courses, Optio global courses, and other orgs' public courses
      const { data } = await api.get('/api/courses?filter=admin_all');
      setCourses(data.courses || []);
    } catch (error) {
      console.error('Failed to fetch courses:', error);
    }
  };

  const fetchAccessibleCourses = async () => {
    try {
      const { data } = await api.get(`/api/admin/organizations/${orgId}`);
      const ids = new Set((data.curated_courses || []).map(c => c.course_id));
      setAccessibleCourseIds(ids);
    } catch (error) {
      console.error('Failed to fetch accessible courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleAvailability = async (courseId, currentlyAvailable) => {
    // Optimistic update
    setAccessibleCourseIds(prev => {
      const newSet = new Set(prev);
      if (currentlyAvailable) {
        newSet.delete(courseId);
      } else {
        newSet.add(courseId);
      }
      return newSet;
    });

    try {
      if (currentlyAvailable) {
        await api.post(`/api/admin/organizations/${orgId}/courses/revoke`, {
          course_id: courseId
        });
      } else {
        await api.post(`/api/admin/organizations/${orgId}/courses/grant`, {
          course_id: courseId
        });
      }
    } catch (error) {
      console.error('Failed to toggle course availability:', error);
      // Revert on failure
      setAccessibleCourseIds(prev => {
        const newSet = new Set(prev);
        if (currentlyAvailable) {
          newSet.add(courseId);
        } else {
          newSet.delete(courseId);
        }
        return newSet;
      });
      alert(error.response?.data?.error || 'Failed to update course availability');
    }
  };

  const handleBulkAction = async (action) => {
    if (selectedIds.size === 0) return;

    const actionText = action === 'grant' ? 'make available' : 'make unavailable';
    if (!confirm(`Are you sure you want to ${actionText} ${selectedIds.size} selected course(s)?`)) {
      return;
    }

    // Optimistic update
    const previousState = new Set(accessibleCourseIds);
    setAccessibleCourseIds(prev => {
      const newSet = new Set(prev);
      selectedIds.forEach(id => {
        if (action === 'grant') {
          newSet.add(id);
        } else {
          newSet.delete(id);
        }
      });
      return newSet;
    });
    setSelectedIds(new Set());

    try {
      const promises = Array.from(selectedIds).map(courseId => {
        if (action === 'grant') {
          return api.post(`/api/admin/organizations/${orgId}/courses/grant`, { course_id: courseId });
        } else {
          return api.post(`/api/admin/organizations/${orgId}/courses/revoke`, { course_id: courseId });
        }
      });

      await Promise.all(promises);
    } catch (error) {
      console.error('Failed to perform bulk action:', error);
      setAccessibleCourseIds(previousState);
      alert('Some courses failed to update. Please try again.');
    }
  };

  const handleToggleSelect = (courseId) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(courseId)) {
      newSelected.delete(courseId);
    } else {
      newSelected.add(courseId);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === paginatedCourses.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(paginatedCourses.map(c => c.id)));
    }
  };

  const isCourseAvailable = (courseId) => {
    const course = courses.find(c => c.id === courseId);
    const isOrgCourse = course?.organization_id === orgId;

    // Org's own courses are always available
    if (isOrgCourse) {
      return true;
    }

    if (policy === 'all_optio') {
      // All non-org courses (Optio courses) are available
      return true;
    } else if (policy === 'curated') {
      // Non-org courses are available only if explicitly granted
      return accessibleCourseIds.has(courseId);
    } else if (policy === 'private_only') {
      // Only org courses are available (already handled above)
      return false;
    }
    return false;
  };

  const filteredCourses = courses.filter(course => {
    const matchesSearch = course.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         course.description?.toLowerCase().includes(searchTerm.toLowerCase());

    const isOrgCourse = course.organization_id === orgId;

    // For private_only: only show org's own courses
    if (policy === 'private_only') {
      return matchesSearch && isOrgCourse;
    }

    // For curated and all_optio: show org courses + all non-org courses (Optio courses)
    // Non-org courses are: courses with null organization_id, or courses from other orgs that are public
    // The backend already filters to only return appropriate courses
    return matchesSearch;
  });

  // Pagination
  const totalPages = Math.ceil(filteredCourses.length / coursesPerPage);
  const startIndex = (currentPage - 1) * coursesPerPage;
  const paginatedCourses = filteredCourses.slice(startIndex, startIndex + coursesPerPage);

  // Stats
  const availableCount = filteredCourses.filter(c => isCourseAvailable(c.id)).length;
  const unavailableCount = filteredCourses.length - availableCount;

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search and Stats Bar */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
        <div className="flex flex-wrap gap-4 items-center justify-between">
          <div className="flex items-center gap-4">
            <input
              type="text"
              placeholder="Search courses..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="border border-gray-200 rounded-lg px-4 py-2 w-64 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm">
            <span className="text-gray-600">
              {filteredCourses.length} courses
            </span>
            <span className="text-green-600 font-medium">
              {availableCount} available
            </span>
            <span className="text-gray-400">
              {unavailableCount} unavailable
            </span>
          </div>
        </div>

        {/* Bulk Actions */}
        {canToggle && selectedIds.size > 0 && (
          <div className="flex gap-3 items-center mt-3 pt-3 border-t border-gray-100">
            <span className="text-sm text-gray-600">{selectedIds.size} selected</span>
            <button
              onClick={() => handleBulkAction('grant')}
              className="px-3 py-1.5 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition-colors"
            >
              Make Available
            </button>
            <button
              onClick={() => handleBulkAction('revoke')}
              className="px-3 py-1.5 bg-gray-600 text-white text-sm font-medium rounded-lg hover:bg-gray-700 transition-colors"
            >
              Make Unavailable
            </button>
            <button
              onClick={() => setSelectedIds(new Set())}
              className="text-gray-500 hover:text-gray-700 text-sm"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Course List */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              {canToggle && (
                <th className="px-4 py-3 text-left w-10">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === paginatedCourses.length && paginatedCourses.length > 0}
                    onChange={handleSelectAll}
                    className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                  />
                </th>
              )}
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">Course</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-24">Source</th>
              <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 uppercase tracking-wider w-32">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {paginatedCourses.length === 0 ? (
              <tr>
                <td colSpan={canToggle ? 4 : 3} className="px-4 py-8 text-center text-gray-500">
                  {searchTerm ? 'No courses match your search' :
                   policy === 'private_only' ? 'No organization courses found. Create courses to see them here.' :
                   'No courses found'}
                </td>
              </tr>
            ) : (
              paginatedCourses.map(course => {
                const available = isCourseAvailable(course.id);
                const isOrgCourse = course.organization_id === orgId;
                const isSelected = selectedIds.has(course.id);

                return (
                  <tr
                    key={course.id}
                    className={`hover:bg-gray-50 transition-colors ${isSelected ? 'bg-optio-purple/5' : ''}`}
                  >
                    {canToggle && (
                      <td className="px-4 py-3">
                        {!isOrgCourse && policy === 'curated' && (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(course.id)}
                            className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                          />
                        )}
                      </td>
                    )}
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900 text-sm">{course.title}</div>
                      {course.description && (
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{course.description}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        {isOrgCourse ? (
                          <span className="text-xs font-medium text-gray-600">Org</span>
                        ) : (
                          optioLogoUrl ? (
                            <img
                              src={optioLogoUrl}
                              alt="Optio"
                              className="h-5 w-auto max-w-[60px] object-contain"
                            />
                          ) : (
                            <span className="text-xs font-semibold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
                              Optio
                            </span>
                          )
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        {isOrgCourse ? (
                          <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-green-50 text-green-700">
                            Always
                          </span>
                        ) : policy === 'all_optio' ? (
                          <div className="relative inline-flex h-6 w-11 items-center rounded-full bg-green-500 cursor-not-allowed opacity-75" title="All Optio courses are available">
                            <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow-sm translate-x-6" />
                          </div>
                        ) : canToggle ? (
                          <button
                            onClick={() => handleToggleAvailability(course.id, available)}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-optio-purple focus:ring-offset-2 ${
                              available ? 'bg-green-500' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform ${
                                available ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        ) : (
                          <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                            available ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                          }`}>
                            {available ? 'Yes' : 'No'}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-600">
            Showing {startIndex + 1} to {Math.min(startIndex + coursesPerPage, filteredCourses.length)} of {filteredCourses.length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Previous
            </button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              let pageNum;
              if (totalPages <= 5) {
                pageNum = i + 1;
              } else if (currentPage <= 3) {
                pageNum = i + 1;
              } else if (currentPage >= totalPages - 2) {
                pageNum = totalPages - 4 + i;
              } else {
                pageNum = currentPage - 2 + i;
              }
              return (
                <button
                  key={pageNum}
                  onClick={() => setCurrentPage(pageNum)}
                  className={`px-3 py-1.5 border rounded-lg text-sm font-medium ${
                    currentPage === pageNum
                      ? 'bg-optio-purple text-white border-optio-purple'
                      : 'border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {pageNum}
                </button>
              );
            })}
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1.5 border border-gray-200 rounded-lg text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
