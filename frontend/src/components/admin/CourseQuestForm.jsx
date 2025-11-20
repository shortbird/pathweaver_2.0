import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, GripVertical, AlertCircle } from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { getPillarData } from '../../utils/pillarMappings';

const CourseQuestForm = ({ mode = 'create', quest = null, onClose, onSuccess }) => {
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [loadingTasks, setLoadingTasks] = useState(mode === 'edit');

  const [formData, setFormData] = useState({
    title: quest?.title || '',
    description: quest?.description || '',
    material_link: quest?.material_link || '',
    lms_platform: quest?.lms_platform || '',
    lms_course_id: quest?.lms_course_id || '',
    lms_assignment_id: quest?.lms_assignment_id || '',
    is_active: quest?.is_active !== undefined ? quest.is_active : false,
    tasks: [
      {
        title: '',
        description: '',
        pillar: 'stem',
        xp_value: 100,
        order_index: 0
      }
    ]
  });

  const pillars = ['stem', 'wellness', 'communication', 'civics', 'art'];

  // Load existing tasks when in edit mode
  useEffect(() => {
    const loadCourseTasks = async () => {
      if (mode === 'edit' && quest?.id) {
        try {
          const response = await api.get(`/api/admin/quests/${quest.id}/course-tasks`);

          if (response.data.tasks && response.data.tasks.length > 0) {
            setFormData(prev => ({
              ...prev,
              tasks: response.data.tasks.map((task, index) => ({
                id: task.id, // Keep task ID for updates
                title: task.title || '',
                description: task.description || '',
                pillar: task.pillar || 'stem',
                xp_value: task.xp_value || 100,
                order_index: index
              }))
            }));
          }
        } catch (error) {
          console.error('Error loading course tasks:', error);
          toast.error('Failed to load course tasks');
        } finally {
          setLoadingTasks(false);
        }
      }
    };

    loadCourseTasks();
  }, [mode, quest]);

  const validateForm = () => {
    const newErrors = {};

    if (!formData.title.trim()) {
      newErrors.title = 'Title is required';
    }

    if (formData.tasks.length === 0) {
      newErrors.tasks = 'At least one task is required';
    }

    // Validate each task
    formData.tasks.forEach((task, index) => {
      if (!task.title.trim()) {
        newErrors[`task_${index}_title`] = 'Task title is required';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      toast.error('Please fix all errors before submitting');
      return;
    }

    setLoading(true);

    try {
      const submitData = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        material_link: formData.material_link.trim() || null,
        lms_platform: formData.lms_platform || null,
        lms_course_id: formData.lms_course_id || null,
        lms_assignment_id: formData.lms_assignment_id || null,
        is_active: formData.is_active,
        tasks: formData.tasks.map((task, index) => ({
          title: task.title.trim(),
          description: task.description.trim(),
          pillar: task.pillar,
          xp_value: parseInt(task.xp_value) || 100,
          order_index: index,
          is_required: true,
          diploma_subjects: ['Electives'],
          subject_xp_distribution: {}
        }))
      };

      let response;

      if (mode === 'edit') {
        // Update existing course quest
        response = await api.put(`/api/admin/quests/${quest.id}/course-tasks`, submitData);
        toast.success(`Course quest updated with ${formData.tasks.length} tasks!`);
      } else {
        // Create new course quest
        response = await api.post('/api/admin/quests/create-course-quest', submitData);
        toast.success(`Course quest created with ${formData.tasks.length} preset tasks!`);
      }

      onSuccess && onSuccess(response.data.quest);
      onClose();
    } catch (error) {
      console.error('Error creating course quest:', error);
      const errorMessage = error.response?.data?.error || 'Failed to create course quest';
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const addTask = () => {
    setFormData({
      ...formData,
      tasks: [
        ...formData.tasks,
        {
          title: '',
          description: '',
          pillar: 'stem',
          xp_value: 100,
          order_index: formData.tasks.length
        }
      ]
    });
  };

  const removeTask = (index) => {
    const newTasks = formData.tasks.filter((_, i) => i !== index);
    setFormData({ ...formData, tasks: newTasks });
  };

  const updateTask = (index, field, value) => {
    const newTasks = [...formData.tasks];
    newTasks[index][field] = value;
    setFormData({ ...formData, tasks: newTasks });

    // Clear error for this field
    const errorKey = `task_${index}_${field}`;
    if (errors[errorKey]) {
      setErrors({ ...errors, [errorKey]: '' });
    }
  };

  const moveTask = (index, direction) => {
    if (
      (direction === 'up' && index === 0) ||
      (direction === 'down' && index === formData.tasks.length - 1)
    ) {
      return;
    }

    const newTasks = [...formData.tasks];
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    [newTasks[index], newTasks[targetIndex]] = [newTasks[targetIndex], newTasks[index]];

    // Update order_index
    newTasks.forEach((task, i) => {
      task.order_index = i;
    });

    setFormData({ ...formData, tasks: newTasks });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b px-6 py-4 flex justify-between items-center z-10">
          <h2 className="text-2xl font-bold bg-gradient-primary bg-clip-text text-transparent">
            {mode === 'edit' ? 'Edit Course Quest' : 'Create Course Quest'}
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
            <X size={24} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6">
          {/* Info Message */}
          <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-800">
              <strong>Course Quests</strong> have preset tasks that are automatically assigned to all enrolled students. Tasks cannot be customized per student.
            </p>
          </div>

          {/* Loading State for Edit Mode */}
          {loadingTasks ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              <span className="ml-3 text-gray-600">Loading course tasks...</span>
            </div>
          ) : (
            <>
              {/* Quest Details */}
              <div className="space-y-6 mb-8">
            <div>
              <label className="block text-sm font-semibold mb-2 text-gray-800">
                Quest Title
                <span className="text-red-500 font-bold ml-1">*</span>
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => {
                  setFormData({ ...formData, title: e.target.value });
                  if (errors.title) setErrors({ ...errors, title: '' });
                }}
                className={`w-full px-4 py-3 border-2 rounded-lg ${
                  errors.title ? 'border-red-500' : 'border-gray-300'
                }`}
                placeholder="e.g., Algebra I - Unit 3"
              />
              {errors.title && (
                <p className="text-red-600 text-sm mt-1 flex items-center gap-1">
                  <AlertCircle size={14} />
                  {errors.title}
                </p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-600">
                Description
              </label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                rows={3}
                placeholder="Course description..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-600">
                Curriculum Source Link
              </label>
              <input
                type="url"
                value={formData.material_link}
                onChange={(e) => setFormData({ ...formData, material_link: e.target.value })}
                className="w-full px-3 py-2 border rounded-lg"
                placeholder="e.g., https://www.khanacademy.org/math/algebra"
              />
              <p className="text-xs text-gray-500 mt-1">
                Optional: Link to external curriculum resources (Khan Academy, etc.)
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium mb-2 text-gray-600">
                  LMS Platform
                </label>
                <select
                  value={formData.lms_platform}
                  onChange={(e) => setFormData({ ...formData, lms_platform: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">None</option>
                  <option value="canvas">Canvas</option>
                  <option value="google_classroom">Google Classroom</option>
                  <option value="schoology">Schoology</option>
                  <option value="moodle">Moodle</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-600">
                  Course ID
                </label>
                <input
                  type="text"
                  value={formData.lms_course_id}
                  onChange={(e) => setFormData({ ...formData, lms_course_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Optional"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2 text-gray-600">
                  Assignment ID
                </label>
                <input
                  type="text"
                  value={formData.lms_assignment_id}
                  onChange={(e) => setFormData({ ...formData, lms_assignment_id: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg"
                  placeholder="Optional"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-gray-600">Status</label>
              <select
                value={formData.is_active.toString()}
                onChange={(e) => setFormData({ ...formData, is_active: e.target.value === 'true' })}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                Only active quests will be visible to students
              </p>
            </div>
          </div>

          {/* Tasks Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-gray-900">Preset Tasks</h3>
              <button
                type="button"
                onClick={addTask}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 font-semibold"
              >
                <Plus className="w-4 h-4" />
                Add Task
              </button>
            </div>

            {errors.tasks && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-red-700 text-sm flex items-center gap-1">
                  <AlertCircle size={16} />
                  {errors.tasks}
                </p>
              </div>
            )}

            <div className="space-y-4">
              {formData.tasks.map((task, index) => {
                const pillarData = getPillarData(task.pillar);

                return (
                  <div
                    key={index}
                    className="bg-gray-50 rounded-lg p-4 border-2 border-gray-200"
                  >
                    <div className="flex items-start gap-3">
                      {/* Order Number */}
                      <div
                        className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-bold text-white"
                        style={{ backgroundColor: pillarData.color }}
                      >
                        {index + 1}
                      </div>

                      {/* Task Fields */}
                      <div className="flex-1 space-y-3">
                        <div>
                          <input
                            type="text"
                            value={task.title}
                            onChange={(e) => updateTask(index, 'title', e.target.value)}
                            className={`w-full px-3 py-2 border rounded-lg ${
                              errors[`task_${index}_title`] ? 'border-red-500' : ''
                            }`}
                            placeholder="Task title *"
                          />
                          {errors[`task_${index}_title`] && (
                            <p className="text-red-600 text-xs mt-1">
                              {errors[`task_${index}_title`]}
                            </p>
                          )}
                        </div>

                        <textarea
                          value={task.description}
                          onChange={(e) => updateTask(index, 'description', e.target.value)}
                          className="w-full px-3 py-2 border rounded-lg"
                          rows={2}
                          placeholder="Task description (optional)"
                        />

                        <div className="flex gap-3">
                          <select
                            value={task.pillar}
                            onChange={(e) => updateTask(index, 'pillar', e.target.value)}
                            className="flex-1 px-3 py-2 border rounded-lg"
                          >
                            {pillars.map((p) => {
                              const pd = getPillarData(p);
                              return (
                                <option key={p} value={p}>
                                  {pd.icon} {pd.name}
                                </option>
                              );
                            })}
                          </select>

                          <input
                            type="number"
                            value={task.xp_value}
                            onChange={(e) => updateTask(index, 'xp_value', e.target.value)}
                            className="w-24 px-3 py-2 border rounded-lg"
                            min="50"
                            max="500"
                          />
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex flex-col gap-2">
                        <button
                          type="button"
                          onClick={() => moveTask(index, 'up')}
                          disabled={index === 0}
                          className="p-2 hover:bg-gray-200 rounded disabled:opacity-30"
                          title="Move up"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => moveTask(index, 'down')}
                          disabled={index === formData.tasks.length - 1}
                          className="p-2 hover:bg-gray-200 rounded disabled:opacity-30"
                          title="Move down"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => removeTask(index)}
                          className="p-2 hover:bg-red-100 rounded text-red-600"
                          title="Delete"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex justify-end gap-4 pt-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-gradient-primary text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-semibold"
            >
              {loading ? (mode === 'edit' ? 'Updating...' : 'Creating...') : (mode === 'edit' ? 'Update Course Quest' : 'Create Course Quest')}
            </button>
          </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
};

export default CourseQuestForm;
