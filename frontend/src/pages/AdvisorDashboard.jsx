import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

export default function AdvisorDashboard() {
  const [dashboardData, setDashboardData] = useState(null);
  const [students, setStudents] = useState([]);
  const [customBadges, setCustomBadges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [dashboardRes, studentsRes, badgesRes] = await Promise.all([
        api.get('/api/advisor/dashboard'),
        api.get('/api/advisor/students'),
        api.get('/api/advisor/badges')
      ]);

      setDashboardData(dashboardRes.data);
      setStudents(studentsRes.data.students || []);
      setCustomBadges(badgesRes.data.badges || []);
    } catch (err) {
      console.error('Error fetching advisor dashboard:', err);
      setError(err.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#ef597b] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchDashboardData}
            className="mt-4 px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold">Advisor Dashboard</h1>
          <p className="mt-2 text-white/90">Manage students and create custom learning paths</p>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-[#ef597b] text-[#ef597b]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('students')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'students'
                  ? 'border-[#ef597b] text-[#ef597b]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Students ({students.length})
            </button>
            <button
              onClick={() => setActiveTab('badges')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'badges'
                  ? 'border-[#ef597b] text-[#ef597b]'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Custom Badges ({customBadges.length})
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <OverviewTab dashboardData={dashboardData} students={students} badges={customBadges} />
        )}
        {activeTab === 'students' && <StudentsTab students={students} onRefresh={fetchDashboardData} />}
        {activeTab === 'badges' && <BadgesTab badges={customBadges} onRefresh={fetchDashboardData} />}
      </div>
    </div>
  );
}

function OverviewTab({ dashboardData, students, badges }) {
  const stats = dashboardData?.stats || {};

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Total Students</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats.total_students || 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Active Students</div>
          <div className="mt-2 text-3xl font-bold text-green-600">{stats.active_students || 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Custom Badges</div>
          <div className="mt-2 text-3xl font-bold text-[#ef597b]">{stats.total_custom_badges || 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Badges Earned</div>
          <div className="mt-2 text-3xl font-bold text-[#6d469b]">{stats.total_badges_earned || 0}</div>
        </div>
      </div>

      {/* Recent Students */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Recent Students</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {students.slice(0, 5).map((student) => (
            <div key={student.id} className="p-6 flex items-center justify-between">
              <div className="flex items-center">
                <div className="h-10 w-10 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] flex items-center justify-center text-white font-semibold">
                  {student.display_name?.charAt(0) || 'S'}
                </div>
                <div className="ml-4">
                  <div className="text-sm font-medium text-gray-900">{student.display_name}</div>
                  <div className="text-sm text-gray-500">Level {student.level} • {student.total_xp || 0} XP</div>
                </div>
              </div>
              <div className="text-sm text-gray-500">
                {student.badge_count || 0} badges earned
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Link
          to="/advisor/badges/create"
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="text-lg font-semibold text-gray-900">Create Custom Badge</div>
          <p className="mt-2 text-sm text-gray-600">Design learning paths tailored to your students</p>
        </Link>
        <Link
          to="/advisor/students"
          className="bg-white rounded-lg shadow p-6 hover:shadow-lg transition-shadow"
        >
          <div className="text-lg font-semibold text-gray-900">View All Students</div>
          <p className="mt-2 text-sm text-gray-600">Monitor progress and assign badges</p>
        </Link>
      </div>
    </div>
  );
}

function StudentsTab({ students, onRefresh }) {
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [progressReport, setProgressReport] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);

  const viewStudentProgress = async (studentId) => {
    try {
      setLoadingReport(true);
      const response = await api.get(`/api/advisor/students/${studentId}/progress`);
      setProgressReport(response.data.report);
      setSelectedStudent(studentId);
    } catch (err) {
      console.error('Error fetching student progress:', err);
      alert('Failed to load student progress');
    } finally {
      setLoadingReport(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Your Students</h2>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90"
        >
          Refresh
        </button>
      </div>

      {students.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-600">No students assigned yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Student
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Level
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Total XP
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Badges
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {students.map((student) => (
                <tr key={student.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="h-10 w-10 rounded-full bg-gradient-to-r from-[#ef597b] to-[#6d469b] flex items-center justify-center text-white font-semibold">
                        {student.display_name?.charAt(0) || 'S'}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{student.display_name}</div>
                        <div className="text-sm text-gray-500">{student.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.level}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.total_xp || 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.badge_count || 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <button
                      onClick={() => viewStudentProgress(student.id)}
                      className="text-[#ef597b] hover:text-[#6d469b] font-medium"
                    >
                      View Progress
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Progress Report Modal */}
      {selectedStudent && progressReport && (
        <StudentProgressModal
          report={progressReport}
          onClose={() => {
            setSelectedStudent(null);
            setProgressReport(null);
          }}
        />
      )}
    </div>
  );
}

function BadgesTab({ badges, onRefresh }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Custom Badges</h2>
        <Link
          to="/advisor/badges/create"
          className="px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90"
        >
          Create New Badge
        </Link>
      </div>

      {badges.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-600">No custom badges created yet</p>
          <Link
            to="/advisor/badges/create"
            className="inline-block mt-4 px-6 py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-lg hover:opacity-90"
          >
            Create Your First Badge
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {badges.map((badge) => (
            <div key={badge.id} className="bg-white rounded-lg shadow p-6">
              <div className="flex items-center justify-between">
                <div className="text-4xl">{badge.icon || '🎯'}</div>
                <span className="text-xs px-2 py-1 bg-gray-100 rounded">{badge.primary_pillar}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold text-gray-900">{badge.name}</h3>
              <p className="mt-2 text-sm text-gray-600 line-clamp-2">{badge.description}</p>
              <div className="mt-4 flex items-center justify-between text-sm text-gray-500">
                <span>{badge.min_quests} quests</span>
                <span>{badge.xp_requirement} XP</span>
              </div>
              <div className="mt-4 flex space-x-2">
                <Link
                  to={`/advisor/badges/${badge.id}/edit`}
                  className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded text-center text-sm hover:bg-gray-200"
                >
                  Edit
                </Link>
                <Link
                  to={`/badges/${badge.id}`}
                  className="flex-1 px-3 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded text-center text-sm hover:opacity-90"
                >
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StudentProgressModal({ report, onClose }) {
  const student = report.student;
  const badges = report.badges;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-xl font-bold text-gray-900">Progress Report</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Student Info */}
          <div>
            <h4 className="font-semibold text-gray-900">{student.display_name}</h4>
            <div className="mt-2 text-sm text-gray-600">
              <div>Level {student.level} • {student.total_xp} XP</div>
            </div>
          </div>

          {/* Badge Stats */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-gray-900">{badges.total}</div>
              <div className="text-sm text-gray-600">Total Badges</div>
            </div>
            <div className="bg-green-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-green-600">{badges.earned}</div>
              <div className="text-sm text-gray-600">Earned</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="text-2xl font-bold text-blue-600">{badges.in_progress}</div>
              <div className="text-sm text-gray-600">In Progress</div>
            </div>
          </div>

          {/* Badge Details */}
          {badges.details && badges.details.length > 0 && (
            <div>
              <h5 className="font-semibold text-gray-900 mb-3">Badge Progress</h5>
              <div className="space-y-2">
                {badges.details.map((badge, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded">
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900">{badge.badges?.name}</div>
                      <div className="text-xs text-gray-500">{badge.badges?.primary_pillar}</div>
                    </div>
                    <div className="text-sm">
                      {badge.earned ? (
                        <span className="px-2 py-1 bg-green-100 text-green-800 rounded">Earned</span>
                      ) : (
                        <span className="text-gray-600">{Math.round(badge.progress)}%</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
