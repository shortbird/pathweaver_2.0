import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../services/api';
import ProgressChart from '../../components/parent/ProgressChart';
import ActivityTimeline from '../../components/parent/ActivityTimeline';
import toast from 'react-hot-toast';
import {
  ArrowDownTrayIcon,
  ArrowLeftIcon,
  CalendarIcon,
  CheckCircleIcon,
  ClockIcon,
  FireIcon
} from '@heroicons/react/24/outline';

const DATE_RANGES = [
  { label: 'Last 7 Days', value: '7days' },
  { label: 'Last 30 Days', value: '30days' },
  { label: 'This Year', value: 'year' },
  { label: 'All Time', value: 'all' }
];

export default function DependentProgressReport() {
  const { studentId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [student, setStudent] = useState(null);
  const [progressData, setProgressData] = useState(null);
  const [dateRange, setDateRange] = useState('30days');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    fetchProgressData();
  }, [studentId, dateRange]);

  const fetchProgressData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch student info and progress data
      const [studentRes, progressRes] = await Promise.all([
        api.get(`/api/dependents/${studentId}`),
        api.get(`/api/observers/student/${studentId}/progress?period=${dateRange}`)
      ]);

      setStudent(studentRes.data.student);
      setProgressData(progressRes.data);
    } catch (err) {
      console.error('Error fetching progress data:', err);
      setError(err.response?.data?.error || 'Failed to load progress data');
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadReport = async (format = 'pdf') => {
    try {
      setDownloading(true);
      toast.loading('Generating report...', { id: 'download' });

      const response = await api.get(
        `/api/observers/student/${studentId}/report?format=${format}&period=${dateRange}`,
        { responseType: 'blob' }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute(
        'download',
        `${student.display_name}_progress_report_${dateRange}.${format}`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();

      toast.success('Report downloaded!', { id: 'download' });
    } catch (err) {
      console.error('Error downloading report:', err);
      toast.error('Failed to download report', { id: 'download' });
    } finally {
      setDownloading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-pink mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading progress report...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const { stats, xp_by_pillar, quests, recent_activity, badges } = progressData || {};

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header - Hide on print */}
      <div className="bg-gradient-to-r from-optio-purple to-optio-pink text-white py-8 print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate(-1)}
                className="p-2 rounded-lg hover:bg-white/10 transition-colors"
              >
                <ArrowLeftIcon className="h-6 w-6" />
              </button>
              <div>
                <h1 className="text-3xl font-bold">
                  {student?.display_name || 'Student'}'s Progress Report
                </h1>
                <p className="mt-1 text-white/90">
                  Viewing {DATE_RANGES.find((r) => r.value === dateRange)?.label}
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <button
                onClick={handlePrint}
                className="px-4 py-2 bg-white text-optio-purple font-semibold rounded-lg hover:bg-gray-100 transition-colors"
              >
                Print
              </button>
              <button
                onClick={() => handleDownloadReport('pdf')}
                disabled={downloading}
                className="flex items-center space-x-2 px-4 py-2 bg-white text-optio-purple font-semibold rounded-lg hover:bg-gray-100 transition-colors disabled:opacity-50"
              >
                <ArrowDownTrayIcon className="h-5 w-5" />
                <span>{downloading ? 'Downloading...' : 'Download PDF'}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Print Header - Only visible on print */}
      <div className="hidden print:block bg-white p-8 border-b">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">
                {student?.display_name || 'Student'}'s Progress Report
              </h1>
              <p className="text-gray-600">
                {DATE_RANGES.find((r) => r.value === dateRange)?.label}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm text-gray-500">Generated via</p>
              <p className="text-lg font-bold bg-gradient-to-r from-optio-purple to-optio-pink bg-clip-text text-transparent">
                Optio Education
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Date Range Selector - Hide on print */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 print:hidden">
        <div className="flex items-center space-x-2">
          <CalendarIcon className="h-5 w-5 text-gray-400" />
          <span className="text-sm text-gray-600">Time Period:</span>
          <div className="flex space-x-2">
            {DATE_RANGES.map((range) => (
              <button
                key={range.value}
                onClick={() => setDateRange(range.value)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dateRange === range.value
                    ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {range.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 print:px-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total XP</p>
                <p className="text-3xl font-bold text-gray-900">{stats?.total_xp || 0}</p>
              </div>
              <div className="p-3 bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg">
                <FireIcon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Quests Completed</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.quests_completed || 0}
                </p>
              </div>
              <div className="p-3 bg-green-100 rounded-lg">
                <CheckCircleIcon className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Current Streak</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.current_streak || 0} days
                </p>
              </div>
              <div className="p-3 bg-orange-100 rounded-lg">
                <FireIcon className="h-6 w-6 text-orange-600" />
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Avg XP/Week</p>
                <p className="text-3xl font-bold text-gray-900">
                  {stats?.avg_xp_per_week || 0}
                </p>
              </div>
              <div className="p-3 bg-blue-100 rounded-lg">
                <ClockIcon className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </div>
        </div>

        {/* XP Breakdown */}
        <div className="mb-8">
          <ProgressChart xpByPillar={xp_by_pillar || {}} />
        </div>

        {/* Quest History */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h3 className="text-xl font-bold text-gray-800 mb-4">Quest History</h3>
          {quests && quests.length > 0 ? (
            <div className="space-y-3">
              {quests.map((quest) => (
                <div
                  key={quest.id}
                  className="flex items-center justify-between p-4 bg-gray-50 rounded-lg"
                >
                  <div className="flex-1">
                    <h4 className="font-semibold text-gray-900">{quest.title}</h4>
                    <div className="flex items-center space-x-4 mt-2">
                      <span className="text-sm text-gray-600">
                        {quest.tasks_completed}/{quest.total_tasks} tasks
                      </span>
                      {quest.completion_percentage === 100 && (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Completed
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-gray-900">{quest.xp_earned} XP</p>
                    <div className="w-32 bg-gray-200 rounded-full h-2 mt-2">
                      <div
                        className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 rounded-full"
                        style={{ width: `${quest.completion_percentage}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-8">No quests started yet</p>
          )}
        </div>

        {/* Recent Activity */}
        <div className="mb-8 print:break-before-page">
          <ActivityTimeline activities={recent_activity || []} />
        </div>

        {/* Badges Earned */}
        {badges && badges.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h3 className="text-xl font-bold text-gray-800 mb-4">Badges Earned</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {badges.map((badge) => (
                <div
                  key={badge.id}
                  className="flex flex-col items-center p-4 bg-gray-50 rounded-lg"
                >
                  {badge.image_url ? (
                    <img
                      src={badge.image_url}
                      alt={badge.name}
                      className="w-16 h-16 mb-2"
                    />
                  ) : (
                    <div className="w-16 h-16 mb-2 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white text-2xl font-bold">
                      {badge.name.charAt(0)}
                    </div>
                  )}
                  <p className="text-sm font-semibold text-gray-900 text-center">
                    {badge.name}
                  </p>
                  {badge.earned_date && (
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(badge.earned_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Print Footer */}
      <div className="hidden print:block mt-8 pt-4 border-t text-center text-sm text-gray-500">
        <p>Generated via Optio Education on {new Date().toLocaleDateString()}</p>
      </div>
    </div>
  );
}
