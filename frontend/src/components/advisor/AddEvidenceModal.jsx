import { useState, useEffect } from 'react';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { helperEvidenceAPI } from '../../services/api';
import toast from 'react-hot-toast';
import EvidenceContentEditor from '../evidence/EvidenceContentEditor';
import { submitHelperEvidence } from '../evidence/helperEvidenceUtils';

/**
 * Advisor AddEvidenceModal - Quest/task selection + standard evidence editor.
 * Steps 1-2 (quest/task selection) are advisor-specific.
 * Evidence entry uses EvidenceContentEditor (single source of truth).
 */
export default function AddEvidenceModal({ isOpen, onClose, studentId, studentName }) {
  const [quests, setQuests] = useState([]);
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen && studentId) {
      loadStudentTasks();
    }
  }, [isOpen, studentId]);

  const loadStudentTasks = async () => {
    setLoadingTasks(true);
    try {
      const response = await helperEvidenceAPI.getStudentTasks(studentId);
      setQuests(response.data.quests || []);
    } catch (error) {
      console.error('Error loading student tasks:', error);
      toast.error('Failed to load student tasks');
    } finally {
      setLoadingTasks(false);
    }
  };

  const handleQuestSelect = (quest) => {
    setSelectedQuest(quest);
    setSelectedTask(null);
  };

  const handleTaskSelect = (task) => {
    setSelectedTask(task);
  };

  const handleClose = () => {
    setSelectedQuest(null);
    setSelectedTask(null);
    onClose();
  };

  const handleSaveEvidence = async (items) => {
    if (!selectedTask) return;

    setSubmitting(true);
    try {
      const { successCount, uploadFailures } = await submitHelperEvidence({
        items,
        studentId,
        taskId: selectedTask.id
      });

      if (uploadFailures > 0) {
        toast.error(`${uploadFailures} item(s) failed to upload`);
      }
      if (successCount > 0) {
        toast.success(`Evidence added for ${studentName}!`);
      }
      handleClose();
    } catch (error) {
      console.error('Error uploading evidence:', error);
      toast.error(error.response?.data?.error || 'Failed to upload evidence');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Background overlay */}
      <div
        className="fixed inset-0 transition-opacity bg-black bg-opacity-50"
        onClick={handleClose}
        role="button"
        tabIndex="0"
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleClose();
          }
        }}
        aria-label="Close modal"
      />

      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="relative inline-block w-full max-w-full sm:max-w-2xl mx-2 sm:mx-0 my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-xl">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-gradient-to-r from-optio-purple to-optio-pink">
            <div className="flex items-center justify-between">
              <h3 className="text-xl font-bold text-white">
                Add Evidence for {studentName}
              </h3>
              <button onClick={handleClose} className="text-white hover:text-gray-200">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-6">
            {loadingTasks ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-optio-purple border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="space-y-6">
                {/* Step 1: Select Quest */}
                <div>
                  <label className="block mb-2 text-sm font-semibold text-gray-700">
                    1. Select Quest
                  </label>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {quests.map((quest) => (
                      <button
                        key={quest.quest_id}
                        onClick={() => handleQuestSelect(quest)}
                        className={`p-4 text-left border-2 rounded-lg transition-all ${
                          selectedQuest?.quest_id === quest.quest_id
                            ? 'border-optio-purple bg-purple-50'
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start space-x-3">
                          {quest.quest_image && (
                            <img src={quest.quest_image} alt={`${quest.quest_title} quest image`} className="w-12 h-12 rounded-md object-cover" />
                          )}
                          <div className="flex-1 min-w-0">
                            <h4 className="font-semibold text-gray-900 truncate">{quest.quest_title}</h4>
                            <p className="text-sm text-gray-600">
                              {quest.active_task_count} active {quest.active_task_count === 1 ? 'task' : 'tasks'}
                            </p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {quests.length === 0 && (
                    <p className="py-4 text-sm text-gray-600">
                      No active quests found for this student.
                    </p>
                  )}
                </div>

                {/* Step 2: Select Task */}
                {selectedQuest && (
                  <div>
                    <label className="block mb-2 text-sm font-semibold text-gray-700">
                      2. Select Task
                    </label>
                    <div className="space-y-2">
                      {selectedQuest.tasks.filter(t => !t.completed).map((task) => (
                        <button
                          key={task.id}
                          onClick={() => handleTaskSelect(task)}
                          className={`w-full p-4 text-left border-2 rounded-lg transition-all ${
                            selectedTask?.id === task.id
                              ? 'border-optio-purple bg-purple-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <h4 className="font-semibold text-gray-900">{task.title}</h4>
                              {task.description && (
                                <p className="mt-1 text-sm text-gray-600">{task.description}</p>
                              )}
                              <p className="mt-1 text-xs text-gray-500">{task.xp_value} XP</p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 3: Add Evidence (using standard EvidenceContentEditor) */}
                {selectedTask && (
                  <div>
                    <label className="block mb-2 text-sm font-semibold text-gray-700">
                      3. Add Evidence
                    </label>
                    <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <EvidenceContentEditor
                        key={selectedTask.id}
                        onSave={handleSaveEvidence}
                        onCancel={handleClose}
                      />
                    </div>
                    <p className="mt-2 text-xs text-gray-600">
                      This evidence will be added to the student's task. The student can edit or remove it before completing the task.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer - only show when task is not selected (editor has its own buttons) */}
          {!selectedTask && (
            <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
              <div className="flex justify-end">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 min-h-[44px]"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
