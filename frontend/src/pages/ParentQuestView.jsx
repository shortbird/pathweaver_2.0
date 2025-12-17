import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { parentAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  ClockIcon,
  BookOpenIcon
} from '@heroicons/react/24/outline';
import UnifiedEvidenceDisplay from '../components/evidence/UnifiedEvidenceDisplay';
import EvidenceUploadForm from '../components/parent/EvidenceUploadForm';

/**
 * ParentQuestView - Read-only quest view for parents
 * Shows student's personalized tasks and completion status
 */
const ParentQuestView = () => {
  const { studentId, questId } = useParams();
  const navigate = useNavigate();
  const [questData, setQuestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showEvidenceForm, setShowEvidenceForm] = useState({});

  // Pillar colors for visual distinction
  const pillarColors = {
    'STEM': 'bg-blue-100 text-blue-800',
    'Wellness': 'bg-green-100 text-green-800',
    'Communication': 'bg-yellow-100 text-yellow-800',
    'Civics': 'bg-red-100 text-red-800',
    'Art': 'bg-purple-100 text-purple-800'
  };

  const loadQuestData = async () => {
    try {
      setLoading(true);
      const response = await parentAPI.getQuestView(studentId, questId);
      setQuestData(response.data);
      setError(null);
    } catch (error) {
      console.error('Error loading quest:', error);
      setError('Failed to load quest details');
      toast.error('Failed to load quest details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQuestData();
  }, [studentId, questId]);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12">
        <div className="flex items-center justify-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
        </div>
      </div>
    );
  }

  if (error || !questData) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-12 text-center">
        <p className="text-red-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {error || 'Quest not found'}
        </p>
        <button
          onClick={() => navigate(`/parent/dashboard/${studentId}`)}
          className="mt-4 text-optio-purple hover:text-purple-800 font-semibold"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          ← Back to Dashboard
        </button>
      </div>
    );
  }

  const { quest, tasks, progress } = questData;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Back Button */}
      <button
        onClick={() => navigate(`/parent/dashboard/${studentId}`)}
        className="flex items-center gap-2 text-gray-600 hover:text-gray-900 font-medium mb-6 transition-colors"
        style={{ fontFamily: 'Poppins, sans-serif' }}
      >
        <ArrowLeftIcon className="w-5 h-5" />
        Back to Dashboard
      </button>

      {/* Quest Header - Mobile optimized */}
      <div className="bg-white rounded-xl shadow-lg overflow-hidden mb-6 sm:mb-8">
        {quest.image_url && (
          <img
            src={quest.image_url}
            alt={quest.title}
            className="w-full h-48 sm:h-64 object-cover"
          />
        )}
        <div className="p-4 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
            <div className="flex-1">
              <h1 className="text-2xl sm:text-4xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {quest.title}
              </h1>
              <p className="text-sm sm:text-base text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {quest.description}
              </p>
            </div>
            {/* Status badges - stack on mobile */}
            <div className="flex flex-row sm:flex-col items-start gap-2">
              <span className={`px-3 py-1 rounded-full text-xs sm:text-sm font-semibold ${
                quest.status === 'completed' ? 'bg-green-100 text-green-800' :
                quest.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                'bg-gray-100 text-gray-800'
              }`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                {quest.status === 'completed' ? 'Completed' :
                 quest.status === 'in_progress' ? 'In Progress' :
                 'Not Started'}
              </span>
              {quest.started_at && (
                <span className="text-xs sm:text-sm text-gray-500 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Started {new Date(quest.started_at).toLocaleDateString()}
                </span>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-4 sm:mt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs sm:text-sm font-semibold text-gray-700" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Progress: {progress.completed_tasks} / {progress.total_tasks} tasks
              </span>
              <span className="text-xs sm:text-sm font-bold text-optio-purple" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {progress.percentage}%
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2 sm:h-3">
              <div
                className="bg-gradient-to-r from-optio-purple to-optio-pink h-2 sm:h-3 rounded-full transition-all"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Parent Capabilities Banner */}
      <div className="bg-purple-50 border-2 border-purple-200 rounded-lg p-3 sm:p-4 mb-6">
        <div className="flex items-start gap-2 sm:gap-3">
          <BookOpenIcon className="w-5 h-5 sm:w-6 sm:h-6 text-optio-purple flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm sm:text-base text-gray-700 font-semibold mb-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
              You Can Help!
            </p>
            <p className="text-xs sm:text-sm text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              Upload evidence (photos, documents, links) to help {quest?.title || 'your student'}. They'll review your evidence and mark tasks as complete when ready.
            </p>
          </div>
        </div>
      </div>

      {/* Tasks List */}
      <div className="space-y-4">
        <h2 className="text-2xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Tasks ({progress.completed_tasks} / {progress.total_tasks} completed)
        </h2>

        {tasks.length === 0 ? (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <p className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
              No tasks have been added to this quest yet.
            </p>
          </div>
        ) : (
          tasks.map((task, index) => (
            <div
              key={task.id}
              className={`bg-white rounded-lg border-2 p-4 sm:p-6 ${
                task.is_completed ? 'border-green-300 bg-green-50' : 'border-gray-200'
              }`}
            >
              <div className="flex items-start gap-3 sm:gap-4">
                {/* Completion Icon */}
                <div className="flex-shrink-0 mt-1">
                  {task.is_completed ? (
                    <CheckCircleIcon className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                  ) : (
                    <ClockIcon className="w-5 h-5 sm:w-6 sm:h-6 text-gray-400" />
                  )}
                </div>

                {/* Task Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <h3 className="text-base sm:text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {index + 1}. {task.title}
                    </h3>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`px-2 py-1 rounded text-xs font-semibold ${pillarColors[task.pillar] || 'bg-gray-100 text-gray-800'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                        {task.pillar}
                      </span>
                      <span className="text-sm font-semibold text-optio-purple" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        {task.xp_value} XP
                      </span>
                    </div>
                  </div>

                  {task.description && (
                    <p className="text-sm sm:text-base text-gray-600 font-medium mb-3" style={{ fontFamily: 'Poppins, sans-serif' }}>
                      {task.description}
                    </p>
                  )}

                  {/* Evidence Display and Upload (available for all tasks) */}
                  <div className={`mt-3 pt-3 ${task.is_completed ? 'border-t border-green-200' : 'border-t border-gray-200'}`}>
                    {task.is_completed && (
                      <p className="text-xs sm:text-sm text-green-700 font-semibold mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        ✓ Completed {new Date(task.completed_at).toLocaleDateString()}
                      </p>
                    )}

                    {/* Enhanced Evidence Display */}
                    {(task.evidence_blocks?.length > 0 || task.evidence_text || task.evidence_url) && (
                      <div className="mt-2 mb-3">
                        <UnifiedEvidenceDisplay
                          evidence={{
                            evidence_type: task.evidence_type || 'legacy_text',
                            evidence_blocks: task.evidence_blocks || [],
                            evidence_text: task.evidence_text,
                            evidence_url: task.evidence_url
                          }}
                          displayMode="full"
                        />
                      </div>
                    )}

                    {/* Evidence Upload Form (available for both completed and incomplete tasks) */}
                    {!showEvidenceForm[task.id] ? (
                      <button
                        onClick={() => setShowEvidenceForm({ ...showEvidenceForm, [task.id]: true })}
                        className="w-full sm:w-auto px-4 py-2 text-xs sm:text-sm font-semibold bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity"
                        style={{ fontFamily: 'Poppins, sans-serif' }}
                      >
                        + Add Evidence
                      </button>
                    ) : (
                      <EvidenceUploadForm
                        taskId={task.id}
                        studentId={studentId}
                        onCancel={() => {
                          const newShowForm = { ...showEvidenceForm };
                          delete newShowForm[task.id];
                          setShowEvidenceForm(newShowForm);
                        }}
                        onSuccess={() => {
                          const newShowForm = { ...showEvidenceForm };
                          delete newShowForm[task.id];
                          setShowEvidenceForm(newShowForm);
                          loadQuestData();
                        }}
                      />
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Back Button (Bottom) */}
      <div className="mt-8 text-center">
        <button
          onClick={() => navigate(`/parent/dashboard/${studentId}`)}
          className="px-6 py-3 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-semibold transition-colors"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          ← Back to Dashboard
        </button>
      </div>
    </div>
  );
};

export default ParentQuestView;
