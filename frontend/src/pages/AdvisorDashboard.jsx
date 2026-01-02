import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import CheckinAnalytics from '../components/advisor/CheckinAnalytics';
import CheckinHistoryModal from '../components/advisor/CheckinHistoryModal';
import AdvisorNotesModal from '../components/advisor/AdvisorNotesModal';
import StudentDetailModal from '../components/advisor/StudentDetailModal';

// Helper function to get student display name with fallback
const getStudentName = (student) => {
  return student.display_name ||
         `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
         'Student';
};

export default function AdvisorDashboard() {
  const { user } = useAuth();
  const [dashboardData, setDashboardData] = useState(null);
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      const [dashboardRes, studentsRes] = await Promise.all([
        api.get('/api/advisor/dashboard'),
        api.get('/api/advisor/students')
      ]);

      setDashboardData(dashboardRes.data);
      setStudents(studentsRes.data.students || []);
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
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-pink mx-auto"></div>
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
            className="mt-4 px-4 py-2 bg-gradient-primary text-white rounded-lg min-h-[44px] touch-manipulation"
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
      <div className="bg-gradient-primary text-white py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold">Advisor Dashboard</h1>
          <p className="mt-2 text-white/90">Manage students</p>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <OverviewTab dashboardData={dashboardData} students={students} onRefresh={fetchDashboardData} />
      </div>
    </div>
  );
}

function OverviewTab({ dashboardData, students, onRefresh }) {
  const stats = dashboardData?.stats || {};
  const navigate = useNavigate();
  const [showCheckinHistory, setShowCheckinHistory] = useState(false);
  const [checkinHistoryStudent, setCheckinHistoryStudent] = useState(null);
  const [showAdvisorNotes, setShowAdvisorNotes] = useState(false);
  const [notesStudent, setNotesStudent] = useState(null);
  const [showStudentDetail, setShowStudentDetail] = useState(false);
  const [detailStudent, setDetailStudent] = useState(null);

  const handleCheckin = (studentId) => {
    navigate(`/advisor/checkin/${studentId}`);
  };

  const handleViewHistory = (student) => {
    setCheckinHistoryStudent(student);
    setShowCheckinHistory(true);
  };

  const handleViewNotes = (student) => {
    setNotesStudent(student);
    setShowAdvisorNotes(true);
  };

  const handleManageTasks = (student) => {
    setDetailStudent(student);
    setShowStudentDetail(true);
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Total Students</div>
          <div className="mt-2 text-3xl font-bold text-gray-900">{stats.total_students || 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Active Students</div>
          <div className="mt-2 text-3xl font-bold text-green-600">{stats.active_students || 0}</div>
        </div>
        <div className="bg-white rounded-lg shadow p-6">
          <div className="text-sm font-medium text-gray-500">Quests Completed</div>
          <div className="mt-2 text-3xl font-bold text-optio-purple">{stats.total_quests_completed || 0}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        <button
          onClick={() => navigate('/advisor/verification')}
          className="bg-white rounded-lg shadow p-6 text-left hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Verify Student Work</h3>
              <p className="text-sm text-gray-500 mt-1">Review and approve subject credits for accreditation</p>
            </div>
            <div className="bg-gradient-to-r from-optio-purple to-optio-pink rounded-full p-3">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
        </button>
        <button
          onClick={() => navigate('/advisor/collaborations')}
          className="bg-white rounded-lg shadow p-6 text-left hover:shadow-lg transition-shadow"
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">Manage Collaborations</h3>
              <p className="text-sm text-gray-500 mt-1">Assign students to work together on quests</p>
            </div>
            <div className="bg-gradient-to-r from-optio-purple to-optio-pink rounded-full p-3">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
            </div>
          </div>
        </button>
      </div>

      {/* Check-in Analytics Widget */}
      <CheckinAnalytics />

      {/* Students Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">My Students</h2>
          <button
            onClick={onRefresh}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 min-h-[44px] touch-manipulation"
          >
            Refresh
          </button>
        </div>
        {students.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No students assigned yet
          </div>
        ) : (
          <div className="overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Student
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Total XP
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Quests
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Check-in
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
                        <div className="h-10 w-10 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink flex items-center justify-center text-white font-semibold">
                          {getStudentName(student).charAt(0)}
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900">{getStudentName(student)}</div>
                          <div className="text-sm text-gray-500">{student.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.total_xp || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.quest_count || 0}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {student.last_checkin ? (
                        <div>
                          <div className="text-gray-900 font-medium">
                            {student.last_checkin.last_checkin_date_formatted}
                          </div>
                          <div className="text-gray-500 text-xs">
                            {student.last_checkin.days_since_checkin} days ago
                          </div>
                        </div>
                      ) : (
                        <span className="text-gray-400 italic">Never</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => handleCheckin(student.id)}
                          className="text-white bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-1 rounded-lg hover:opacity-90 font-medium min-h-[44px] touch-manipulation"
                        >
                          Check-in
                        </button>
                        <button
                          onClick={() => handleManageTasks(student)}
                          className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg font-medium min-h-[44px] touch-manipulation"
                        >
                          Manage Tasks
                        </button>
                        <button
                          onClick={() => handleViewHistory(student)}
                          className="text-optio-purple hover:text-optio-purple-dark font-medium min-h-[44px] px-2 touch-manipulation"
                        >
                          History
                        </button>
                        <button
                          onClick={() => handleViewNotes(student)}
                          className="text-optio-purple hover:text-optio-purple-dark font-medium min-h-[44px] px-2 touch-manipulation"
                        >
                          Advisor Notes
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Check-in History Modal */}
      {showCheckinHistory && checkinHistoryStudent && (
        <CheckinHistoryModal
          studentId={checkinHistoryStudent.id}
          studentName={getStudentName(checkinHistoryStudent)}
          onClose={() => {
            setShowCheckinHistory(false);
            setCheckinHistoryStudent(null);
          }}
        />
      )}

      {/* Student Detail Modal */}
      {showStudentDetail && detailStudent && (
        <StudentDetailModal
          student={detailStudent}
          onClose={() => {
            setShowStudentDetail(false);
            setDetailStudent(null);
          }}
          onTasksUpdated={onRefresh}
        />
      )}

      {/* Advisor Notes Modal */}
      {showAdvisorNotes && notesStudent && (
        <AdvisorNotesModal
          subjectId={notesStudent.id}
          subjectName={getStudentName(notesStudent)}
          onClose={() => {
            setShowAdvisorNotes(false);
            setNotesStudent(null);
          }}
        />
      )}
    </div>
  );
}

