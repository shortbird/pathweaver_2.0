import { useState, useEffect } from 'react';
import { Plus, Flag, Users } from 'lucide-react';
import api from '../../services/api';
import { getPillarData } from '../../utils/pillarMappings';

export default function TaskLibraryView({ questId, onTaskAdded, onGenerateCustom }) {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [addingTaskId, setAddingTaskId] = useState(null);

  useEffect(() => {
    loadLibraryTasks();
  }, [questId]);

  const loadLibraryTasks = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await api.get(`/api/quests/${questId}/task-library`);
      setTasks(response.data.tasks || []);
    } catch (err) {
      console.error('Failed to load library tasks:', err);
      setError('Failed to load task library');
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async (sampleTaskId) => {
    setAddingTaskId(sampleTaskId);
    setError(null);

    try {
      const response = await api.post(`/api/quests/${questId}/task-library/select`, {
        sample_task_id: sampleTaskId
      });

      if (response.data.success) {
        // Notify parent component
        if (onTaskAdded) {
          onTaskAdded();
        }
        // Remove task from local state (optional - could keep it)
        // setTasks(tasks.filter(t => t.id !== sampleTaskId));
      }
    } catch (err) {
      console.error('Failed to add task:', err);
      setError(err.response?.data?.error || 'Failed to add task');
    } finally {
      setAddingTaskId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500" style={{ fontFamily: 'Poppins' }}>Loading task library...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-red-50 border-2 border-red-200 rounded-xl text-red-700">
        <p className="font-semibold" style={{ fontFamily: 'Poppins' }}>{error}</p>
      </div>
    );
  }

  if (tasks.length === 0) {
    return (
      <div className="text-center py-12">
        <h3 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Poppins' }}>
          No Tasks Available Yet
        </h3>
        <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins' }}>
          This quest has no pre-generated tasks. Be the first to create personalized tasks!
        </p>
        <button
          onClick={onGenerateCustom}
          className="px-8 py-4 bg-gradient-primary text-white rounded-xl font-bold text-lg hover:shadow-xl transition-all"
          style={{ fontFamily: 'Poppins' }}
        >
          Generate Personalized Tasks
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-2xl font-bold" style={{ fontFamily: 'Poppins' }}>
            Task Library
          </h3>
          <p className="text-gray-600" style={{ fontFamily: 'Poppins' }}>
            Choose from {tasks.length} tasks created by other learners
          </p>
        </div>
        <button
          onClick={onGenerateCustom}
          className="px-6 py-3 bg-gradient-primary text-white rounded-xl font-bold hover:shadow-xl transition-all"
          style={{ fontFamily: 'Poppins' }}
        >
          Generate Custom Tasks
        </button>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {tasks.map(task => {
          const pillarData = getPillarData(task.pillar);
          const isAdding = addingTaskId === task.id;

          return (
            <div
              key={task.id}
              className="border-2 border-gray-200 rounded-xl p-5 hover:shadow-lg transition-all bg-white"
            >
              {/* Task Title */}
              <h4 className="font-bold text-lg mb-2 line-clamp-2" style={{ fontFamily: 'Poppins' }}>
                {task.title}
              </h4>

              {/* Task Description */}
              <p className="text-gray-600 text-sm mb-4 line-clamp-3" style={{ fontFamily: 'Poppins' }}>
                {task.description}
              </p>

              {/* Badges */}
              <div className="flex items-center gap-2 mb-4">
                <div className="px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold">
                  {pillarData.name}
                </div>
                <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-semibold">
                  {task.xp_value} XP
                </div>
              </div>

              {/* Usage Count */}
              {task.usage_count > 0 && (
                <div className="flex items-center gap-1 text-xs text-gray-500 mb-3">
                  <Users className="w-3 h-3" />
                  <span>Used by {task.usage_count} student{task.usage_count !== 1 ? 's' : ''}</span>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2">
                <button
                  onClick={() => handleAddTask(task.id)}
                  disabled={isAdding}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-all disabled:opacity-50 font-semibold"
                  style={{ fontFamily: 'Poppins' }}
                >
                  {isAdding ? (
                    'Adding...'
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Add Task
                    </>
                  )}
                </button>
                {/* Flag button (optional) */}
                {/* <button
                  className="px-3 py-2 border-2 border-gray-300 rounded-lg hover:bg-gray-50 transition-all"
                  title="Flag inappropriate content"
                >
                  <Flag className="w-4 h-4 text-gray-500" />
                </button> */}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
