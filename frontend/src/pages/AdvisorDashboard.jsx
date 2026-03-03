import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../services/api';
import { advisorAPI } from '../services/api';
import AdvisorStudentListPanel from '../components/advisor/AdvisorStudentListPanel';
import AdvisorDefaultPanel from '../components/advisor/AdvisorDefaultPanel';
import AdvisorStudentPanel from '../components/advisor/AdvisorStudentPanel';
import CreditReviewQueue from '../components/advisor/CreditReviewQueue';

// Helper function to get student display name with fallback
const getStudentName = (student) => {
  return student.display_name ||
         `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
         'Student';
};

export default function AdvisorDashboard() {
  const { user } = useAuth();
  const [students, setStudents] = useState([]);
  const [caseloadSummary, setCaseloadSummary] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreditQueue, setShowCreditQueue] = useState(false);
  const [pendingCreditCount, setPendingCreditCount] = useState(0);

  // Mobile breakpoint detection
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [studentsRes, caseloadRes] = await Promise.all([
        api.get('/api/advisor/students'),
        advisorAPI.getCaseloadSummary()
      ]);

      setStudents(studentsRes.data.students || []);

      if (caseloadRes.data.success) {
        setCaseloadSummary(caseloadRes.data.summary);
      }

      // Pending credit count will be loaded by CreditReviewQueue component
      // Don't duplicate the fetch here to avoid race conditions
    } catch (err) {
      console.error('Error fetching advisor dashboard:', err);
      setError(err.response?.data?.error || 'Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleSelectStudent = (student) => {
    setSelectedStudent(student);
  };

  const handleBack = () => {
    setSelectedStudent(null);
  };

  const perStudentRhythm = caseloadSummary?.per_student_rhythm || {};
  const rhythmCounts = caseloadSummary?.rhythm_counts || {};

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-pink mx-auto" />
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
            onClick={fetchData}
            className="mt-4 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg min-h-[44px] touch-manipulation"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Mobile: show one panel at a time
  if (isMobile) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white py-4 px-4">
          <h1 className="text-xl font-bold">
            {selectedStudent ? getStudentName(selectedStudent) : 'Advisor Dashboard'}
          </h1>
          {!selectedStudent && (
            <p className="text-sm text-white/80 mt-0.5">
              {students.length} student{students.length !== 1 ? 's' : ''}
            </p>
          )}
        </div>

        <div className="flex-1 flex flex-col">
          {selectedStudent ? (
            <AdvisorStudentPanel
              student={selectedStudent}
              onBack={handleBack}
              onTasksUpdated={fetchData}
            />
          ) : (
            <div className="flex-1 flex flex-col">
              <div className="flex-1">
                <AdvisorStudentListPanel
                  students={students}
                  perStudentRhythm={perStudentRhythm}
                  rhythmCounts={rhythmCounts}
                  selectedStudentId={null}
                  onSelectStudent={handleSelectStudent}
                  isMobile={true}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Desktop: split panel layout
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white py-4 px-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Advisor Dashboard</h1>
            <p className="text-sm text-white/80 mt-0.5">
              {students.length} student{students.length !== 1 ? 's' : ''}
              {(rhythmCounts.in_flow || 0) > 0 && ` -- ${rhythmCounts.in_flow} in flow`}
            </p>
          </div>
          <button
            onClick={() => { setShowCreditQueue(!showCreditQueue); setSelectedStudent(null); }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              showCreditQueue
                ? 'bg-white text-optio-purple'
                : 'bg-white/20 text-white hover:bg-white/30'
            }`}
          >
            Credit Reviews
            {pendingCreditCount > 0 && (
              <span className={`px-1.5 py-0.5 text-xs font-bold rounded-full ${
                showCreditQueue ? 'bg-optio-purple text-white' : 'bg-white text-optio-purple'
              }`}>
                {pendingCreditCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Split panel */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left panel - Student list */}
        <div className="w-72 xl:w-80 flex-shrink-0">
          <AdvisorStudentListPanel
            students={students}
            perStudentRhythm={perStudentRhythm}
            rhythmCounts={rhythmCounts}
            selectedStudentId={selectedStudent?.id}
            onSelectStudent={handleSelectStudent}
          />
        </div>

        {/* Right panel - Default, student detail, or credit queue */}
        <div className="flex-1 overflow-hidden">
          {showCreditQueue ? (
            <div className="h-full overflow-y-auto p-6">
              <CreditReviewQueue />
            </div>
          ) : selectedStudent ? (
            <AdvisorStudentPanel
              key={selectedStudent.id}
              student={selectedStudent}
              onBack={handleBack}
              onTasksUpdated={fetchData}
            />
          ) : (
            <AdvisorDefaultPanel caseloadSummary={caseloadSummary} />
          )}
        </div>
      </div>
    </div>
  );
}
