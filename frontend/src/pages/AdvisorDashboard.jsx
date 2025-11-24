import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import UnifiedQuestForm from '../components/admin/UnifiedQuestForm';
import CourseQuestForm from '../components/admin/CourseQuestForm';
import CheckinAnalytics from '../components/advisor/CheckinAnalytics';
import CheckinHistoryModal from '../components/advisor/CheckinHistoryModal';
import AdvisorNotesModal from '../components/advisor/AdvisorNotesModal';
import StudentDetailModal from '../components/advisor/StudentDetailModal';
import toast from 'react-hot-toast';

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
  const [activeTab, setActiveTab] = useState('overview');

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
            className="mt-4 px-4 py-2 bg-gradient-primary text-white rounded-lg"
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

      {/* Navigation Tabs */}
      <div className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'overview'
                  ? 'border-optio-pink text-optio-pink'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Overview
            </button>
            <button
              onClick={() => setActiveTab('quests')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'quests'
                  ? 'border-optio-pink text-optio-pink'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Quests
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {activeTab === 'overview' && (
          <OverviewTab dashboardData={dashboardData} students={students} onRefresh={fetchDashboardData} />
        )}
        {activeTab === 'quests' && <QuestsTab onRefresh={fetchDashboardData} />}
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
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

      {/* Check-in Analytics Widget */}
      <CheckinAnalytics />

      {/* Students Table */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-900">My Students</h2>
          <button
            onClick={onRefresh}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90"
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
                          className="text-white bg-gradient-to-r from-optio-purple to-optio-pink px-3 py-1 rounded-lg hover:opacity-90 font-medium"
                        >
                          Check-in
                        </button>
                        <button
                          onClick={() => handleManageTasks(student)}
                          className="text-white bg-blue-600 hover:bg-blue-700 px-3 py-1 rounded-lg font-medium"
                        >
                          Manage Tasks
                        </button>
                        <button
                          onClick={() => handleViewHistory(student)}
                          className="text-optio-purple hover:text-optio-purple-dark font-medium"
                        >
                          History
                        </button>
                        <button
                          onClick={() => handleViewNotes(student)}
                          className="text-optio-purple hover:text-optio-purple-dark font-medium"
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

function StudentsTab({ students, onRefresh }) {
  const navigate = useNavigate();
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showCheckinHistory, setShowCheckinHistory] = useState(false);
  const [checkinHistoryStudent, setCheckinHistoryStudent] = useState(null);
  const [showAdvisorNotes, setShowAdvisorNotes] = useState(false);
  const [notesStudent, setNotesStudent] = useState(null);

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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-gray-900">Your Students</h2>
        <button
          onClick={onRefresh}
          className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90"
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
                  Total XP
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Badges
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
                      <div className="h-10 w-10 rounded-full bg-gradient-primary flex items-center justify-center text-white font-semibold">
                        {getStudentName(student).charAt(0)}
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{getStudentName(student)}</div>
                        <div className="text-sm text-gray-500">{student.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.total_xp || 0}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{student.badge_count || 0}</td>
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                    <button
                      onClick={() => handleCheckin(student.id)}
                      className="text-white bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-1 rounded-lg hover:from-purple-700 hover:to-pink-700 font-medium"
                    >
                      Check-in
                    </button>
                    <button
                      onClick={() => handleViewHistory(student)}
                      className="text-purple-600 hover:text-purple-700 font-medium"
                    >
                      History
                    </button>
                    <button
                      onClick={() => handleViewNotes(student)}
                      className="text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Advisor Notes
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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

function QuestsTab({ onRefresh }) {
  const [quests, setQuests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showOptioForm, setShowOptioForm] = useState(false);
  const [showCourseForm, setShowCourseForm] = useState(false);

  useEffect(() => {
    fetchQuests();
  }, []);

  const fetchQuests = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/admin/quests');
      setQuests(response.data.quests || []);
    } catch (err) {
      console.error('Error fetching quests:', err);
      toast.error('Failed to load quests');
    } finally {
      setLoading(false);
    }
  };

  const handleQuestSave = () => {
    setShowOptioForm(false);
    setShowCourseForm(false);
    fetchQuests();
    toast.success('Quest created successfully as a draft. An admin will review and publish it.');
  };

  return (
    <div className="space-y-6">
      {/* Forms - These are modals that render their own containers */}
      {showOptioForm && (
        <UnifiedQuestForm
          mode="create"
          onClose={() => setShowOptioForm(false)}
          onSuccess={handleQuestSave}
        />
      )}

      {showCourseForm && (
        <CourseQuestForm
          mode="create"
          onClose={() => setShowCourseForm(false)}
          onSuccess={handleQuestSave}
        />
      )}

      {!showOptioForm && !showCourseForm && (
        <>
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Quests</h2>
              <p className="text-sm text-gray-600 mt-1">Create quest drafts for admin review and publication</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowOptioForm(true)}
                className="px-4 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90"
              >
                Create Optio Quest
              </button>
              <button
                onClick={() => setShowCourseForm(true)}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
              >
                Create Course Quest
              </button>
            </div>
          </div>

      {/* Quests List */}
      {loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-pink mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading quests...</p>
        </div>
      ) : quests.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-600">No quests created yet</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Quest Title
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Created
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quests.map((quest) => (
                <tr key={quest.id}>
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">{quest.title}</div>
                    {quest.big_idea && (
                      <div className="text-sm text-gray-500 mt-1 line-clamp-1">{quest.big_idea}</div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="text-sm text-gray-900">{quest.quest_type}</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {quest.is_active ? (
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                        Published
                      </span>
                    ) : (
                      <span className="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                        Draft
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(quest.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      </>
      )}
    </div>
  );
}

