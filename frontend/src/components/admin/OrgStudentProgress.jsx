import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../services/api';
import toast from 'react-hot-toast';

/**
 * OrgStudentProgress
 *
 * Student progress analytics tab for org admins.
 * Shows per-student metrics with filtering, sorting, and CSV export.
 */
export default function OrgStudentProgress({ orgId }) {
  const navigate = useNavigate();
  const [students, setStudents] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [sortField, setSortField] = useState('total_xp');
  const [sortDir, setSortDir] = useState('desc');
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    end: new Date().toISOString().split('T')[0]
  });
  const [exporting, setExporting] = useState(false);

  const handleStudentClick = (studentId) => {
    // Navigate to student's portfolio with state to enable back navigation
    navigate(`/public/diploma/${studentId}`, {
      state: { from: 'org-progress', orgId }
    });
  };

  useEffect(() => {
    fetchProgress();
  }, [orgId, dateRange]);

  const fetchProgress = async () => {
    try {
      setLoading(true);
      const response = await api.get(`/api/admin/organizations/${orgId}/students/progress`, {
        params: {
          start_date: dateRange.start,
          end_date: dateRange.end
        }
      });
      if (response.data.success) {
        setStudents(response.data.students || []);
        setSummary(response.data.summary || null);
      }
    } catch (error) {
      console.error('Error fetching student progress:', error);
      toast.error('Failed to load student progress');
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };

  const sortedStudents = [...students].sort((a, b) => {
    let aVal = a[sortField];
    let bVal = b[sortField];

    // Handle nulls
    if (aVal === null || aVal === undefined) aVal = sortDir === 'asc' ? Infinity : -Infinity;
    if (bVal === null || bVal === undefined) bVal = sortDir === 'asc' ? Infinity : -Infinity;

    // Handle strings
    if (typeof aVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    }

    // Handle numbers
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
  });

  const handleExportCSV = async () => {
    try {
      setExporting(true);
      const response = await api.get(`/api/admin/organizations/${orgId}/students/progress`, {
        params: {
          start_date: dateRange.start,
          end_date: dateRange.end,
          format: 'csv'
        },
        responseType: 'blob'
      });

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `student_progress_${dateRange.start}_to_${dateRange.end}.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      toast.success('CSV exported successfully');
    } catch (error) {
      console.error('Error exporting CSV:', error);
      toast.error('Failed to export CSV');
    } finally {
      setExporting(false);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const SortHeader = ({ field, children }) => (
    <th
      className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        {sortField === field && (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={sortDir === 'asc' ? 'M5 15l7-7 7 7' : 'M19 9l-7 7-7-7'}
            />
          </svg>
        )}
      </div>
    </th>
  );

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-start gap-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Student Progress</h2>
          <p className="text-sm text-gray-600 mt-1">
            Track student engagement and learning progress
          </p>
        </div>
        <button
          onClick={handleExportCSV}
          disabled={exporting || students.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {exporting ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-700"></div>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          Export CSV
        </button>
      </div>

      {/* Date Range Filter */}
      <div className="flex flex-wrap items-center gap-4 bg-gray-50 p-4 rounded-lg">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">From:</label>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-optio-purple focus:border-optio-purple"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">To:</label>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-optio-purple focus:border-optio-purple"
          />
        </div>
        <button
          onClick={() => setDateRange({
            start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end: new Date().toISOString().split('T')[0]
          })}
          className="px-3 py-1.5 text-sm text-optio-purple hover:bg-optio-purple/10 rounded-md"
        >
          Last 7 days
        </button>
        <button
          onClick={() => setDateRange({
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end: new Date().toISOString().split('T')[0]
          })}
          className="px-3 py-1.5 text-sm text-optio-purple hover:bg-optio-purple/10 rounded-md"
        >
          Last 30 days
        </button>
        <button
          onClick={() => setDateRange({
            start: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
            end: new Date().toISOString().split('T')[0]
          })}
          className="px-3 py-1.5 text-sm text-optio-purple hover:bg-optio-purple/10 rounded-md"
        >
          Last 90 days
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-gray-900">{summary.total_students}</div>
            <div className="text-sm text-gray-600">Total Students</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-optio-purple">{summary.total_xp?.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Total XP</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-optio-pink">{summary.total_completions_period}</div>
            <div className="text-sm text-gray-600">Tasks Completed (Period)</div>
          </div>
          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="text-2xl font-bold text-gray-900">{summary.avg_xp?.toLocaleString()}</div>
            <div className="text-sm text-gray-600">Avg XP per Student</div>
          </div>
        </div>
      )}

      {/* Students Table */}
      {students.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <svg className="w-12 h-12 text-gray-400 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z" />
          </svg>
          <p className="text-gray-600">No students found in this organization</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <SortHeader field="name">Student</SortHeader>
                  <SortHeader field="total_xp">Total XP</SortHeader>
                  <SortHeader field="quests_enrolled">Quests</SortHeader>
                  <SortHeader field="tasks_completed_period">Tasks (Period)</SortHeader>
                  <SortHeader field="tasks_completed_all">Tasks (All)</SortHeader>
                  <SortHeader field="last_active">Last Active</SortHeader>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedStudents.map((student) => (
                  <tr key={student.id} className="hover:bg-gray-50">
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="h-10 w-10 flex-shrink-0">
                          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center text-white font-medium">
                            {student.name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                        </div>
                        <div className="ml-4">
                          <button
                            onClick={() => handleStudentClick(student.id)}
                            className="text-sm font-medium text-gray-900 hover:text-optio-purple hover:underline text-left"
                          >
                            {student.name}
                          </button>
                          <div className="text-sm text-gray-500">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm font-semibold text-optio-purple">
                        {student.total_xp?.toLocaleString() || 0} XP
                      </div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {student.quests_completed || 0} / {student.quests_enrolled || 0}
                      </div>
                      <div className="text-xs text-gray-500">completed / enrolled</div>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-sm font-medium rounded-full ${
                        student.tasks_completed_period > 0
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-600'
                      }`}>
                        {student.tasks_completed_period || 0}
                      </span>
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-600">
                      {student.tasks_completed_all || 0}
                    </td>
                    <td className="px-4 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(student.last_active)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
