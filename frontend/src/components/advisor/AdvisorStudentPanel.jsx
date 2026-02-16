import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeftIcon,
  ChatBubbleLeftRightIcon,
  DocumentTextIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline';
import AdvisorStudentOverviewContent from './AdvisorStudentOverviewContent';
import StudentTasksPanel from './StudentTasksPanel';
import CheckinHistoryModal from './CheckinHistoryModal';
import AdvisorNotesModal from './AdvisorNotesModal';
import AdvisorMomentCaptureButton from './AdvisorMomentCaptureButton';
import AdvisorMomentsTab from './AdvisorMomentsTab';
import AdvisorCheckinHistoryInline from './AdvisorCheckinHistoryInline';
import api, { observerAPI } from '../../services/api';
import FeedCard from '../observer/FeedCard';

const getStudentName = (student) => {
  return student.display_name ||
    `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
    'Student';
};

const TABS = [
  { key: 'activity', label: 'Activity' },
  { key: 'overview', label: 'Overview' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'checkins', label: 'Check-ins' },
  { key: 'moments', label: 'Moments' },
];

const AdvisorStudentPanel = ({ student, onBack, onTasksUpdated }) => {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('activity');
  const [quests, setQuests] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [taskError, setTaskError] = useState('');
  const [showCheckinHistory, setShowCheckinHistory] = useState(false);
  const [showAdvisorNotes, setShowAdvisorNotes] = useState(false);

  // Activity feed state
  const [feedItems, setFeedItems] = useState([]);
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedCursor, setFeedCursor] = useState(null);
  const [feedHasMore, setFeedHasMore] = useState(false);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  const studentName = getStudentName(student);

  // Load activity feed when activity tab activated
  useEffect(() => {
    if (activeTab === 'activity') {
      loadActivityFeed();
    }
  }, [activeTab, student.id]);

  const loadActivityFeed = async (nextCursor = null) => {
    try {
      if (nextCursor) {
        setFeedLoadingMore(true);
      } else {
        setFeedLoading(true);
        setFeedItems([]);
      }
      const params = { studentId: student.id, limit: 15 };
      if (nextCursor) params.cursor = nextCursor;
      const response = await observerAPI.getFeed(params);
      const data = response.data;
      if (nextCursor) {
        setFeedItems(prev => [...prev, ...(data.items || [])]);
      } else {
        setFeedItems(data.items || []);
      }
      setFeedCursor(data.next_cursor || null);
      setFeedHasMore(data.has_more || false);
    } catch (err) {
      console.error('Error fetching student activity feed:', err);
    } finally {
      setFeedLoading(false);
      setFeedLoadingMore(false);
    }
  };

  // Load quests when tasks tab activated
  useEffect(() => {
    if (activeTab === 'tasks') {
      loadStudentQuests();
    }
  }, [activeTab, student.id]);

  const loadStudentQuests = async () => {
    setLoadingTasks(true);
    setTaskError('');
    try {
      const response = await api.get(`/api/advisor/students/${student.id}/quests-with-tasks`);
      if (response.data.success) {
        setQuests(response.data.quests || []);
      } else {
        setTaskError(response.data.error || 'Failed to load quests');
      }
    } catch (err) {
      setTaskError(err.response?.data?.error || 'Failed to load quests');
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleTaskUpdate = async (questId, taskId, updatedData) => {
    const response = await api.put(
      `/api/admin/users/${student.id}/quests/${questId}/tasks/${taskId}`,
      updatedData
    );
    if (response.data.success) {
      await loadStudentQuests();
      if (onTasksUpdated) onTasksUpdated();
    } else {
      throw new Error(response.data.error || 'Failed to update task');
    }
  };

  const handleTaskDelete = async (questId, taskId) => {
    const response = await api.delete(
      `/api/admin/users/${student.id}/quests/${questId}/tasks/${taskId}`
    );
    if (response.data.success) {
      await loadStudentQuests();
      if (onTasksUpdated) onTasksUpdated();
    } else {
      throw new Error(response.data.error || 'Failed to delete task');
    }
  };

  const handleTaskReorder = async (questId, taskOrder) => {
    setQuests(prevQuests => prevQuests.map(quest => {
      if (quest.quest_id === questId) {
        const orderMap = {};
        taskOrder.forEach(item => { orderMap[item.task_id] = item.order_index; });
        const reorderedTasks = [...quest.tasks].sort((a, b) => {
          const orderA = orderMap[a.id] !== undefined ? orderMap[a.id] : a.order_index;
          const orderB = orderMap[b.id] !== undefined ? orderMap[b.id] : b.order_index;
          return orderA - orderB;
        });
        return { ...quest, tasks: reorderedTasks };
      }
      return quest;
    }));

    const response = await api.post(
      `/api/admin/users/${student.id}/quests/${questId}/tasks/reorder`,
      { task_order: taskOrder }
    );
    if (!response.data.success) {
      await loadStudentQuests();
      throw new Error(response.data.error || 'Failed to reorder tasks');
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
            aria-label="Back to student list"
          >
            <ArrowLeftIcon className="w-5 h-5" />
          </button>

          {student.avatar_url ? (
            <img src={student.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover" />
          ) : (
            <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-optio-purple text-sm font-semibold">
              {studentName.charAt(0).toUpperCase()}
            </div>
          )}

          <div>
            <h2 className="text-base font-semibold text-gray-900">{studentName}</h2>
            {student.email && (
              <p className="text-xs text-gray-500">{student.email}</p>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(`/advisor/checkin/${student.id}`)}
            className="px-3 py-1.5 text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg hover:opacity-90 transition-opacity min-h-[36px]"
          >
            Check-in
          </button>
          <button
            onClick={() => setShowCheckinHistory(true)}
            className="p-1.5 text-gray-500 hover:text-optio-purple hover:bg-gray-100 rounded-lg transition-colors"
            title="Check-in history"
          >
            <ChatBubbleLeftRightIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowAdvisorNotes(true)}
            className="p-1.5 text-gray-500 hover:text-optio-purple hover:bg-gray-100 rounded-lg transition-colors"
            title="Advisor notes"
          >
            <DocumentTextIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 bg-white">
        <nav className="flex px-4" aria-label="Student tabs">
          {TABS.map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`
                py-3 px-4 text-sm font-medium border-b-2 transition-colors
                ${activeTab === tab.key
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }
              `}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'activity' && (
          <div className="p-4">
            {feedLoading ? (
              <div className="space-y-4">
                {[1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse bg-white rounded-lg border border-gray-200 p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-gray-200 rounded-full" />
                      <div className="h-4 bg-gray-200 rounded w-32" />
                    </div>
                    <div className="h-3 bg-gray-200 rounded w-full mb-2" />
                    <div className="h-3 bg-gray-200 rounded w-2/3" />
                  </div>
                ))}
              </div>
            ) : feedItems.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <p className="text-sm">No recent activity for this student yet.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {feedItems.map((item, idx) => (
                  <FeedCard
                    key={`${item.completion_id || item.learning_event_id || 'item'}-${idx}`}
                    item={item}
                    showStudentName={false}
                  />
                ))}
                {feedHasMore && (
                  <button
                    onClick={() => loadActivityFeed(feedCursor)}
                    disabled={feedLoadingMore}
                    className="w-full py-2 text-sm text-optio-purple hover:text-optio-pink font-medium transition-colors disabled:opacity-50"
                  >
                    {feedLoadingMore ? 'Loading...' : 'Load more'}
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="p-4">
            <AdvisorStudentOverviewContent studentId={student.id} />
          </div>
        )}

        {activeTab === 'tasks' && (
          <div className="p-4 space-y-4">
            {loadingTasks && (
              <div className="flex items-center justify-center py-12">
                <ArrowPathIcon className="w-8 h-8 text-optio-purple animate-spin" />
              </div>
            )}
            {taskError && (
              <div className="bg-red-50 border border-red-200 rounded-md p-4">
                <p className="text-red-800 text-sm">{taskError}</p>
              </div>
            )}
            {!loadingTasks && !taskError && quests.length === 0 && (
              <div className="text-center py-12 text-gray-600">
                This student has no active quests yet.
              </div>
            )}
            {!loadingTasks && !taskError && quests.length > 0 && (
              <>
                <div className="mb-2">
                  <h3 className="text-lg font-semibold text-gray-900">Active Quests</h3>
                  <p className="text-sm text-gray-600">Click on a quest to view and edit its tasks</p>
                </div>
                {quests.map(quest => (
                  <StudentTasksPanel
                    key={quest.quest_id}
                    quest={quest}
                    studentId={student.id}
                    studentName={studentName}
                    onTaskUpdate={handleTaskUpdate}
                    onTaskDelete={handleTaskDelete}
                    onTaskReorder={handleTaskReorder}
                  />
                ))}
              </>
            )}
          </div>
        )}

        {activeTab === 'checkins' && (
          <div className="p-4">
            <AdvisorCheckinHistoryInline
              studentId={student.id}
              studentName={studentName}
            />
          </div>
        )}

        {activeTab === 'moments' && (
          <div className="p-4">
            <AdvisorMomentsTab studentId={student.id} studentName={studentName} />
          </div>
        )}
      </div>

      {/* Floating capture button (only on moments tab) */}
      {activeTab === 'moments' && (
        <AdvisorMomentCaptureButton
          studentId={student.id}
          studentName={studentName}
        />
      )}

      {/* Modals */}
      {showCheckinHistory && (
        <CheckinHistoryModal
          studentId={student.id}
          studentName={studentName}
          onClose={() => setShowCheckinHistory(false)}
        />
      )}

      {showAdvisorNotes && (
        <AdvisorNotesModal
          subjectId={student.id}
          subjectName={studentName}
          onClose={() => setShowAdvisorNotes(false)}
        />
      )}
    </div>
  );
};

AdvisorStudentPanel.propTypes = {
  student: PropTypes.object.isRequired,
  onBack: PropTypes.func.isRequired,
  onTasksUpdated: PropTypes.func,
};

export default AdvisorStudentPanel;
