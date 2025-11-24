import { useState } from 'react';
import { Edit2, Trash2, CheckCircle, Circle, ChevronDown, ChevronUp, GripVertical } from 'lucide-react';
import TaskEditModal from './TaskEditModal';

const PILLAR_COLORS = {
  stem: 'bg-blue-500',
  wellness: 'bg-green-500',
  communication: 'bg-yellow-500',
  civics: 'bg-purple-500',
  art: 'bg-pink-500'
};

const PILLAR_LABELS = {
  stem: 'STEM',
  wellness: 'Wellness',
  communication: 'Communication',
  civics: 'Civics',
  art: 'Art'
};

export default function StudentTasksPanel({ quest, onTaskUpdate, onTaskDelete, onTaskReorder }) {
  const [expandedQuest, setExpandedQuest] = useState(null);
  const [editingTask, setEditingTask] = useState(null);
  const [deletingTask, setDeletingTask] = useState(null);
  const [draggedTask, setDraggedTask] = useState(null);
  const [dragOverTask, setDragOverTask] = useState(null);

  const handleToggleQuest = (questId) => {
    setExpandedQuest(expandedQuest === questId ? null : questId);
  };

  const handleEditTask = (task) => {
    setEditingTask(task);
  };

  const handleDeleteTask = async (task) => {
    if (task.completed) {
      alert('Cannot delete completed tasks. Completed tasks must remain for portfolio integrity.');
      return;
    }

    if (window.confirm(`Are you sure you want to delete "${task.title}"? This action cannot be undone.`)) {
      setDeletingTask(task.id);
      try {
        await onTaskDelete(quest.quest_id, task.id);
      } catch (err) {
        console.error('Failed to delete task:', err);
        alert(err.message || 'Failed to delete task');
      } finally {
        setDeletingTask(null);
      }
    }
  };

  const handleSaveTask = async (updatedData) => {
    try {
      await onTaskUpdate(quest.quest_id, editingTask.id, updatedData);
      setEditingTask(null);
    } catch (err) {
      throw err;
    }
  };

  const handleDragStart = (e, task) => {
    if (task.completed) return; // Don't allow dragging completed tasks
    setDraggedTask(task);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e, task) => {
    e.preventDefault();
    if (task.completed || !draggedTask || draggedTask.id === task.id) return;
    setDragOverTask(task);
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDragLeave = () => {
    setDragOverTask(null);
  };

  const handleDrop = async (e, dropTask) => {
    e.preventDefault();
    if (!draggedTask || draggedTask.id === dropTask.id || dropTask.completed) {
      setDraggedTask(null);
      setDragOverTask(null);
      return;
    }

    // Calculate new order
    const tasks = [...quest.tasks];
    const dragIndex = tasks.findIndex(t => t.id === draggedTask.id);
    const dropIndex = tasks.findIndex(t => t.id === dropTask.id);

    // Reorder tasks
    tasks.splice(dragIndex, 1);
    tasks.splice(dropIndex, 0, draggedTask);

    // Update order_index for all tasks
    const reorderedTasks = tasks.map((task, index) => ({
      task_id: task.id,
      order_index: index
    }));

    // Clear drag state immediately for better UX
    setDraggedTask(null);
    setDragOverTask(null);

    try {
      // API call happens in background, UI already updated
      await onTaskReorder(quest.quest_id, reorderedTasks);
    } catch (err) {
      console.error('Failed to reorder tasks:', err);
      alert(err.message || 'Failed to reorder tasks');
    }
  };

  const handleDragEnd = () => {
    setDraggedTask(null);
    setDragOverTask(null);
  };

  const isExpanded = expandedQuest === quest.quest_id;

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      {/* Quest Header */}
      <button
        onClick={() => handleToggleQuest(quest.quest_id)}
        className="w-full flex items-center justify-between p-4 bg-gray-50 hover:bg-gray-100 transition-colors"
      >
        <div className="flex items-center space-x-4">
          {quest.quest_image_url && (
            <img
              src={quest.quest_image_url}
              alt={quest.quest_title}
              className="w-12 h-12 rounded-md object-cover"
            />
          )}
          <div className="text-left">
            <h3 className="text-lg font-semibold text-gray-900">{quest.quest_title}</h3>
            <p className="text-sm text-gray-600">
              {quest.completed_tasks} / {quest.total_tasks} tasks completed ({quest.completion_percentage}%)
            </p>
          </div>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-5 h-5 text-gray-500" />
        ) : (
          <ChevronDown className="w-5 h-5 text-gray-500" />
        )}
      </button>

      {/* Task List */}
      {isExpanded && (
        <div className="divide-y divide-gray-200">
          {quest.tasks && quest.tasks.length > 0 ? (
            quest.tasks.map((task) => (
              <div
                key={task.id}
                draggable={!task.completed}
                onDragStart={(e) => handleDragStart(e, task)}
                onDragOver={(e) => handleDragOver(e, task)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, task)}
                onDragEnd={handleDragEnd}
                className={`
                  p-4 transition-all
                  ${task.completed ? 'bg-gray-50' : 'bg-white'}
                  ${draggedTask?.id === task.id ? 'opacity-50' : ''}
                  ${dragOverTask?.id === task.id ? 'border-t-4 border-optio-purple' : ''}
                  ${!task.completed ? 'cursor-move' : ''}
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-3 flex-1">
                    {/* Drag Handle */}
                    {!task.completed && (
                      <GripVertical className="w-5 h-5 text-gray-400 flex-shrink-0 mt-1 cursor-grab active:cursor-grabbing" />
                    )}

                    {/* Completion Status Icon */}
                    {task.completed ? (
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0 mt-1" />
                    ) : (
                      <Circle className="w-5 h-5 text-gray-300 flex-shrink-0 mt-1" />
                    )}

                    {/* Task Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center space-x-2 mb-1">
                        <h4 className={`font-semibold ${task.completed ? 'text-gray-600' : 'text-gray-900'}`}>
                          {task.title}
                        </h4>
                      </div>

                      {task.description && (
                        <p className={`text-sm mb-2 ${task.completed ? 'text-gray-500' : 'text-gray-600'}`}>
                          {task.description}
                        </p>
                      )}

                      {/* Task Metadata */}
                      <div className="flex items-center space-x-4 text-xs text-gray-500">
                        <div className="flex items-center space-x-1">
                          <div className={`w-2 h-2 rounded-full ${PILLAR_COLORS[task.pillar] || 'bg-gray-400'}`} />
                          <span>{PILLAR_LABELS[task.pillar] || task.pillar}</span>
                        </div>
                        <span>{task.xp_value} XP</span>
                        {task.completed_at && (
                          <span className="text-green-600">
                            Completed {new Date(task.completed_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  {!task.completed && (
                    <div className="flex items-center space-x-2 ml-4">
                      <button
                        onClick={() => handleEditTask(task)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                        title="Edit task"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTask(task)}
                        disabled={deletingTask === task.id}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
                        title="Delete task"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="p-8 text-center text-gray-500">
              <p>No tasks found for this quest</p>
            </div>
          )}
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <TaskEditModal
          task={editingTask}
          onClose={() => setEditingTask(null)}
          onSave={handleSaveTask}
        />
      )}
    </div>
  );
}
