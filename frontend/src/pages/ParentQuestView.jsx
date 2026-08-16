import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { parentAPI, helperEvidenceAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';
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
import QuestPersonalizationWizard from '../components/quests/QuestPersonalizationWizard';

/**
 * ParentQuestView - Streamlined quest view for parents to upload evidence and
 * add tasks to their student's quest.
 *
 * Evidence uses the standard AddEvidenceModal (single source of truth).
 *
 * Task authoring runs the SAME QuestPersonalizationWizard the student uses —
 * identical AI generation, complexity dial, and hand-written path — with only
 * the write target swapped to the child (POST /api/family/quests/:id/tasks,
 * which persists through the shared persist_accepted_task helper so a
 * parent-added task is byte-for-byte what a student self-accepted task is).
 * Mirrors how v2 mobile reuses its TaskCreationWizard on the parent screen.
 */
const ParentQuestView = () => {
  const { studentId, questId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [questData, setQuestData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedTaskId, setExpandedTaskId] = useState(null);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceModalTaskId, setEvidenceModalTaskId] = useState(null);
  const [deletingBlockId, setDeletingBlockId] = useState(null);
  const [taskWizardOpen, setTaskWizardOpen] = useState(false);

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

  const canDeleteBlock = (block) =>
    !!user?.id &&
    block?.uploaded_by_role === 'parent' &&
    block?.uploaded_by_user_id === user.id;

  const handleDeleteBlock = async (block) => {
    if (!block?.id || deletingBlockId) return;
    if (!window.confirm('Remove this evidence? This cannot be undone.')) return;

    try {
      setDeletingBlockId(block.id);
      await helperEvidenceAPI.deleteBlock(block.id);
      toast.success('Evidence removed');
      await loadQuestData();
    } catch (err) {
      console.error('Error removing evidence:', err);
      toast.error(err.response?.data?.error || 'Failed to remove evidence');
    } finally {
      setDeletingBlockId(null);
    }
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

  // Write a single wizard-accepted task to the STUDENT's enrollment. The
  // backend re-verifies the parent->student relationship and persists via the
  // same helper the student's own accept-task path uses, so success_criteria,
  // AI subject classification and diploma subjects all carry over.
  const addTaskForStudent = async (task) => {
    await parentAPI.createTaskForDependent(questId, {
      child_id: studentId,
      title: task.title,
      description: task.description,
      pillar: task.pillar,
      xp_value: task.xp_value,
      success_criteria: task.success_criteria,
      diploma_subjects: task.diploma_subjects
    });
  };

  // Hand-written path: the family endpoint takes one task at a time, so send
  // them in order. Sequential rather than parallel so order_index stays stable
  // (each insert reads the current max) and a mid-batch failure reports how far
  // it got instead of leaving an unpredictable subset written.
  const addManualTasksForStudent = async (newTasks) => {
    for (const task of newTasks) {
      await addTaskForStudent(task);
    }
  };

  const handleWizardComplete = async () => {
    setTaskWizardOpen(false);
    toast.success('Tasks added to your student\'s quest');
    await loadQuestData();
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
        <p className="text-red-600 font-medium mb-4">
          {error || 'Quest not found'}
        </p>
        <button
          onClick={() => navigate(`/parent/dashboard/${studentId}`)}
          className="flex items-center gap-2 text-optio-purple hover:text-optio-purple-dark font-semibold"
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
        >
          <ArrowLeftIcon className="w-5 h-5" />
          <span className="hidden sm:inline">Back</span>
        </button>

        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6">
          <div className="max-w-4xl mx-auto">
            <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">
              {quest.title}
            </h1>
            {quest.description && (
              <p className="text-white/80 text-sm sm:text-base line-clamp-2">
                {quest.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-4xl mx-auto px-4 py-6">
        {/* Help Banner, with the Add Tasks action on the same row. Stacks on
            narrow screens so the button never crowds the copy. */}
        <div className="bg-gradient-to-r from-optio-purple/5 to-optio-pink/5 border border-optio-purple/20 rounded-xl p-4 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="flex-shrink-0 w-10 h-10 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
                <PlusIcon className="w-5 h-5 text-white" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">
                  Help Upload Evidence
                </p>
                <p className="text-sm text-gray-600 mt-1">
                  Add photos, documents, or links for any task below. Your child will review and can mark tasks complete.
                </p>
              </div>
            </div>

            {/* Add tasks — same wizard the student uses, written to their quest. */}
            {questData.can_add_tasks && (
              <button
                onClick={() => setTaskWizardOpen(true)}
                className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 transition-opacity"
              >
                <PlusIcon className="w-5 h-5" />
                Add Tasks
              </button>
            )}
          </div>
        </div>

        {/* Tasks List */}
        <div className="space-y-3">
          {tasks.length === 0 ? (
            <div className="bg-white rounded-xl p-8 text-center border border-gray-200">
              <p className="text-gray-600 font-medium">
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
                  className={`bg-white rounded-xl border overflow-hidden transition-all ${
                    task.is_completed
                      ? 'border-green-200 bg-green-50/30'
                      : 'border-gray-200 hover:border-optio-purple/20'
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
                        <h3 className={`font-semibold ${task.is_completed ? 'text-gray-600' : 'text-gray-900'}`}>
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                            {task.description}
                          </p>
                        )}

                        {hasEvidence && !isExpanded && (
                          <div className="flex items-center gap-2 mt-2">
                            <button
                              type="button"
                              onClick={() => setExpandedTaskId(task.id)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-optio-purple bg-optio-purple/5 hover:bg-optio-purple/10 px-2 py-1 rounded-full transition-colors"
                            >
                              <PhotoIcon className="w-3 h-3" />
                              View evidence
                            </button>
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
                      >
                        {isExpanded ? 'Close' : hasEvidence ? 'View / Add Evidence' : '+ Add Evidence'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Evidence Section */}
                  {isExpanded && (
                    <div className="border-t border-gray-200 bg-gray-50 p-4">
                      {/* Existing Evidence */}
                      {hasEvidence && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
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
                            canDeleteBlock={canDeleteBlock}
                            onDeleteBlock={handleDeleteBlock}
                          />
                        </div>
                      )}

                      {/* Add Evidence Button - opens the standard modal */}
                      <button
                        onClick={() => handleOpenEvidenceModal(task.id)}
                        className="w-full px-4 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:shadow-md transition-all min-h-[44px] flex items-center justify-center gap-2"
                      >
                        <PlusIcon className="w-5 h-5" />
                        Add Evidence
                      </button>
                      <p className="text-xs text-gray-600 mt-2 text-center">
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
            <p className="text-sm text-gray-500 mb-2">
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

      {/* Task authoring — the student's own wizard, pointed at the student.
          approachExamples is intentionally omitted: the "Choose a Path" option
          posts to add-path-tasks, which writes to the CALLER's enrollment and
          has no parent delegation, so it would silently enroll the parent. */}
      {taskWizardOpen && (
        <QuestPersonalizationWizard
          questId={questId}
          questTitle={quest.title}
          onComplete={handleWizardComplete}
          onCancel={() => setTaskWizardOpen(false)}
          onAcceptTaskOverride={addTaskForStudent}
          onManualTasksOverride={addManualTasksForStudent}
          skipSubjectXp
        />
      )}
    </div>
  );
};

export default ParentQuestView;
