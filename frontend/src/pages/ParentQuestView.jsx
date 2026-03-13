import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { parentAPI } from '../services/api';
import toast from 'react-hot-toast';
import {
  ArrowLeftIcon,
  CheckCircleIcon,
  PlusIcon,
  PhotoIcon
} from '@heroicons/react/24/outline';
import UnifiedEvidenceDisplay from '../components/evidence/UnifiedEvidenceDisplay';
import AddEvidenceModal from '../components/evidence/AddEvidenceModal';
import { submitHelperEvidence } from '../components/evidence/helperEvidenceUtils';

/**
 * ParentQuestView - Streamlined quest view for parents to upload evidence.
 * Uses the standard AddEvidenceModal (single source of truth) for evidence upload.
 */
const ParentQuestView = () => {
  const { studentId, questId } = useParams();
  const navigate = useNavigate();
  const [questData, setQuestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceModalTaskId, setEvidenceModalTaskId] = useState(null);

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

  const handleOpenEvidenceModal = (taskId) => {
    setEvidenceModalTaskId(taskId);
    setEvidenceModalOpen(true);
  };

  const handleSaveHelperEvidence = async (newItems) => {
    if (!evidenceModalTaskId) return;

    try {
      const { successCount, uploadFailures } = await submitHelperEvidence({
        items: newItems,
        studentId,
        taskId: evidenceModalTaskId
      });

      if (uploadFailures > 0) {
        toast.error(`${uploadFailures} item(s) failed to upload`);
      }
      if (successCount > 0) {
        toast.success(`${successCount} evidence item${successCount > 1 ? 's' : ''} uploaded successfully!`);
        loadQuestData();
      }
    } catch (error) {
      console.error('Error uploading evidence:', error);
      toast.error(error.response?.data?.error || 'Failed to upload evidence');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    );
  }

  if (error || !questData) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
        <p className="text-red-600 font-medium mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
          {error || 'Quest not found'}
        </p>
        <button
          onClick={() => navigate(`/parent/dashboard/${studentId}`)}
          className="flex items-center gap-2 text-optio-purple hover:text-purple-800 font-semibold"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          <ArrowLeftIcon className="w-5 h-5" />
          Back to Dashboard
        </button>
      </div>
    );
  }

  const { quest, tasks } = questData;
  const incompleteTasks = tasks.filter(t => !t.is_completed).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Compact Hero Header with Overlay */}
      <div className="relative h-48 sm:h-56">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: quest.image_url
              ? `url(${quest.image_url})`
              : 'linear-gradient(135deg, #7c3aed 0%, #ec4899 100%)'
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />

        <button
          onClick={() => navigate(`/parent/dashboard/${studentId}`)}
          className="absolute top-4 left-4 flex items-center gap-2 text-white/90 hover:text-white font-medium transition-colors z-10"
          style={{ fontFamily: 'Poppins, sans-serif' }}
        >
          <ArrowLeftIcon className="w-5 h-5" />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {quest.title}
            </h1>
            {quest.description && (
              <p className="text-white/80 text-sm sm:text-base line-clamp-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                {quest.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Help Banner */}
        <div className="bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4 mb-6">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
              <PlusIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-semibold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Help Upload Evidence
              </p>
              <p className="text-sm text-gray-600 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
                Add photos, documents, or links for any task below. Your child will review and can mark tasks complete.
              </p>
            </div>
          </div>
        </div>

        {/* Tasks List */}
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
              <p className="text-gray-600 font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
                No tasks have been added to this quest yet.
              </p>
            </div>
          ) : (
            tasks.map((task) => {
              const isExpanded = expandedTaskId === task.id;
              const hasEvidence = task.evidence_blocks?.length > 0 || task.evidence_text || task.evidence_url;

              return (
                <div
                  key={task.id}
                  className={`bg-white rounded-xl border-2 overflow-hidden transition-all ${
                    task.is_completed
                      ? 'border-green-200 bg-green-50/30'
                      : 'border-gray-200 hover:border-purple-200'
                  }`}
                >
                  {/* Task Header - Always Visible */}
                  <div className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 mt-0.5">
                        {task.is_completed ? (
                          <CheckCircleIcon className="w-6 h-6 text-green-500" />
                        ) : (
                          <div className="w-6 h-6 rounded-full border-2 border-gray-300" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className={`font-semibold ${task.is_completed ? 'text-gray-600' : 'text-gray-900'}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            {task.description}
                          </p>
                        )}

                        {hasEvidence && !isExpanded && (
                          <div className="flex items-center gap-2 mt-2">
                            <span className="inline-flex items-center gap-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                              <PhotoIcon className="w-3 h-3" />
                              Evidence attached
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Toggle expand / Add Evidence button */}
                      <button
                        onClick={() => setExpandedTaskId(isExpanded ? null : task.id)}
                        className={`flex-shrink-0 px-3 py-2 rounded-lg text-sm font-semibold transition-all min-h-[44px] ${
                          isExpanded
                            ? 'bg-gray-100 text-gray-700'
                            : 'bg-gradient-to-r from-optio-purple to-optio-pink text-white hover:shadow-md'
                        }`}
                        style={{ fontFamily: 'Poppins, sans-serif' }}
                      >
                        {isExpanded ? 'Close' : '+ Add Evidence'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Evidence Section */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50 p-4">
                      {/* Existing Evidence */}
                      {hasEvidence && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
                            Current Evidence
                          </p>
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

                      {/* Add Evidence Button - opens the standard modal */}
                      <button
                        onClick={() => handleOpenEvidenceModal(task.id)}
                        className="w-full px-4 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-md transition-all min-h-[44px] flex items-center justify-center gap-2"
                        style={{ fontFamily: 'Poppins, sans-serif' }}
                      >
                        <PlusIcon className="w-5 h-5" />
                        Add Evidence
                      </button>
                      <p className="text-xs text-gray-600 mt-2 text-center" style={{ fontFamily: 'Poppins, sans-serif' }}>
                        Your student will see this evidence when they work on this task. They can edit or remove it before completing.
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Quick Actions Footer */}
        {incompleteTasks > 0 && (
          <div className="mt-8 text-center">
            <p className="text-sm text-gray-500 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
              {incompleteTasks} task{incompleteTasks !== 1 ? 's' : ''} remaining
            </p>
          </div>
        )}
      </div>

      {/* Standard Evidence Upload Modal */}
      <AddEvidenceModal
        isOpen={evidenceModalOpen}
        onClose={() => {
          setEvidenceModalOpen(false);
          setEvidenceModalTaskId(null);
        }}
        onSave={handleSaveHelperEvidence}
      />
    </div>
  );
};

export default ParentQuestView;
