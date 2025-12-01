import { useState, useEffect } from 'react';
import { XMarkIcon, PlusIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { helperEvidenceAPI } from '../../services/api';
import toast from 'react-hot-toast';

const BLOCK_TYPES = [
  { value: 'text', label: 'Text', icon: '📝', description: 'Written explanation or reflection' },
  { value: 'link', label: 'Link', icon: '🔗', description: 'External resource or project URL' },
  { value: 'image', label: 'Image', icon: '📸', description: 'Screenshot or photo' },
  { value: 'video', label: 'Video', icon: '🎥', description: 'YouTube or Vimeo link' },
  { value: 'document', label: 'Document', icon: '📄', description: 'PDF or document file' }
];

export default function AddEvidenceModal({ isOpen, onClose, studentId, studentName }) {
  const [quests, setQuests] = useState([]);
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [selectedTask, setSelectedTask] = useState(null);
  const [blockType, setBlockType] = useState('text');
  const [content, setContent] = useState({});
  const [loading, setLoading] = useState(false);
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

  const handleSubmit = async () => {
    if (!selectedTask) {
      toast.error('Please select a task');
      return;
    }

    if (!validateContent()) {
      return;
    }

    setSubmitting(true);
    try {
      const data = {
        student_id: studentId,
        task_id: selectedTask.id,
        block_type: blockType,
        content: content
      };

      await helperEvidenceAPI.uploadForStudent(data);
      toast.success(`Evidence added for ${studentName}!`);
      handleClose();
    } catch (error) {
      console.error('Error uploading evidence:', error);
      toast.error(error.response?.data?.error || 'Failed to upload evidence');
    } finally {
      setSubmitting(false);
    }
  };

  const validateContent = () => {
    switch (blockType) {
      case 'text':
        if (!content.text?.trim()) {
          toast.error('Please enter text content');
          return false;
        }
        break;
      case 'link':
        if (!content.url?.trim()) {
          toast.error('Please enter a URL');
          return false;
        }
        if (!content.url.startsWith('http://') && !content.url.startsWith('https://')) {
          toast.error('URL must start with http:// or https://');
          return false;
        }
        break;
      case 'image':
        if (!content.url?.trim()) {
          toast.error('Please enter an image URL');
          return false;
        }
        break;
      case 'video':
        if (!content.url?.trim()) {
          toast.error('Please enter a video URL');
          return false;
        }
        break;
      case 'document':
        if (!content.url?.trim()) {
          toast.error('Please enter a document URL');
          return false;
        }
        break;
      default:
        return false;
    }
    return true;
  };

  const handleClose = () => {
    setSelectedQuest(null);
    setSelectedTask(null);
    setBlockType('text');
    setContent({});
    onClose();
  };

  const renderContentEditor = () => {
    switch (blockType) {
      case 'text':
        return (
          <textarea
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent resize-none"
            rows="6"
            placeholder="Enter text explanation, reflection, or notes..."
            value={content.text || ''}
            onChange={(e) => setContent({ text: e.target.value })}
          />
        );

      case 'link':
        return (
          <div className="space-y-3">
            <input
              type="url"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="https://example.com"
              value={content.url || ''}
              onChange={(e) => setContent({ ...content, url: e.target.value })}
            />
            <input
              type="text"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="Link title (optional)"
              value={content.title || ''}
              onChange={(e) => setContent({ ...content, title: e.target.value })}
            />
          </div>
        );

      case 'image':
        return (
          <div className="space-y-3">
            <input
              type="url"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="Image URL (e.g., from Google Drive, Imgur)"
              value={content.url || ''}
              onChange={(e) => setContent({ url: e.target.value })}
            />
            <p className="text-sm text-gray-600">
              Tip: Upload to Google Drive, set sharing to "Anyone with the link", then paste the link here
            </p>
          </div>
        );

      case 'video':
        return (
          <div className="space-y-3">
            <input
              type="url"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="Video URL (YouTube, Vimeo, etc.)"
              value={content.url || ''}
              onChange={(e) => setContent({ url: e.target.value })}
            />
          </div>
        );

      case 'document':
        return (
          <div className="space-y-3">
            <input
              type="url"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
              placeholder="Document URL (Google Drive, Dropbox, etc.)"
              value={content.url || ''}
              onChange={(e) => setContent({ url: e.target.value })}
            />
            <p className="text-sm text-gray-600">
              Tip: Upload to Google Drive or Dropbox, set sharing to "Anyone with the link"
            </p>
          </div>
        );
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        <div className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75" onClick={handleClose} />

        <div className="inline-block w-full max-w-4xl my-8 overflow-hidden text-left align-middle transition-all transform bg-white shadow-xl rounded-xl">
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
                            <img src={quest.quest_image} alt="" className="w-12 h-12 rounded-md object-cover" />
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

                {/* Step 3: Select Evidence Type */}
                {selectedTask && (
                  <div>
                    <label className="block mb-2 text-sm font-semibold text-gray-700">
                      3. Select Evidence Type
                    </label>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                      {BLOCK_TYPES.map((type) => (
                        <button
                          key={type.value}
                          onClick={() => {
                            setBlockType(type.value);
                            setContent({});
                          }}
                          className={`p-3 text-center border-2 rounded-lg transition-all ${
                            blockType === type.value
                              ? 'border-optio-purple bg-purple-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="text-2xl mb-1">{type.icon}</div>
                          <div className="text-xs font-semibold text-gray-900">{type.label}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Step 4: Add Content */}
                {selectedTask && (
                  <div>
                    <label className="block mb-2 text-sm font-semibold text-gray-700">
                      4. Add Content
                    </label>
                    {renderContentEditor()}
                    <p className="mt-2 text-xs text-gray-600">
                      This evidence will be added to the student's task. The student can edit or remove it before completing the task.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
            <div className="flex justify-end space-x-3">
              <button
                onClick={handleClose}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!selectedTask || submitting}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Adding Evidence...' : 'Add Evidence'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
