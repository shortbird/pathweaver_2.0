import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, CheckCircle, BookOpen, Eye, X } from 'lucide-react';
import api from '../services/api';
import { getPillarData } from '../utils/pillarMappings';
import toast from 'react-hot-toast';

export default function TaskLibraryBrowser() {
  const { questId } = useParams();
  const navigate = useNavigate();
  const [quest, setQuest] = useState(null);
  const [libraryTasks, setLibraryTasks] = useState([]);
  const [selectedTasks, setSelectedTasks] = useState(new Set());
  const [addedTasks, setAddedTasks] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [addingAll, setAddingAll] = useState(false);
  const [detailsModalTask, setDetailsModalTask] = useState(null);

  useEffect(() => {
    fetchQuestAndLibrary();
  }, [questId]);

  const fetchQuestAndLibrary = async () => {
    setLoading(true);
    try {
      // Fetch quest details
      const questResponse = await api.get(`/api/quests/${questId}`);
      setQuest(questResponse.data);

      // Fetch library tasks
      const libraryResponse = await api.get(`/api/quests/${questId}/task-library`);
      setLibraryTasks(libraryResponse.data.tasks || []);
    } catch (error) {
      console.error('Error fetching library:', error);
      toast.error('Failed to load task library');
    } finally {
      setLoading(false);
    }
  };

  const toggleTaskSelection = (taskId) => {
    setSelectedTasks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(taskId)) {
        newSet.delete(taskId);
      } else {
        newSet.add(taskId);
      }
      return newSet;
    });
  };

  const handleAddSelectedTasks = async () => {
    if (selectedTasks.size === 0) {
      toast.error('Please select at least one task');
      return;
    }

    setAddingAll(true);
    let successCount = 0;
    let failCount = 0;

    for (const taskId of selectedTasks) {
      try {
        await api.post(`/api/quests/${questId}/task-library/select`, {
          sample_task_id: taskId
        });

        // Mark as added
        setAddedTasks(prev => new Set([...prev, taskId]));
        successCount++;
      } catch (error) {
        console.error('Error adding task:', error);
        failCount++;
      }
    }

    // Clear selections
    setSelectedTasks(new Set());
    setAddingAll(false);

    // Show result
    if (successCount > 0 && failCount === 0) {
      toast.success(`Added ${successCount} task${successCount > 1 ? 's' : ''} to your quest!`);
    } else if (successCount > 0 && failCount > 0) {
      toast.success(`Added ${successCount} task${successCount > 1 ? 's' : ''}. ${failCount} failed.`);
    } else {
      toast.error('Failed to add tasks');
    }
  };

  const handleDone = () => {
    // Navigate back to quest detail page
    navigate(`/quests/${questId}`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-purple-50 to-pink-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple mx-auto mb-4"></div>
          <p className="text-gray-600" style={{ fontFamily: 'Poppins' }}>Loading task library...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-purple-50 to-pink-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <button
            onClick={() => navigate(`/quests/${questId}`)}
            className="flex items-center gap-2 text-gray-600 hover:text-optio-purple mb-4 transition-colors"
            style={{ fontFamily: 'Poppins' }}
          >
            <ArrowLeft className="w-5 h-5" />
            Back to Quest
          </button>

          <h1 className="text-4xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
            Task Library
          </h1>
          <p className="text-lg text-gray-600 mb-4" style={{ fontFamily: 'Poppins' }}>
            Browse and add tasks to your quest: <span className="font-semibold">{quest?.title}</span>
          </p>

          {/* Progress Indicator & Selection Counter */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm">
              <CheckCircle className="w-5 h-5 text-green-500" />
              <span className="text-gray-700" style={{ fontFamily: 'Poppins' }}>
                <span className="font-semibold">{addedTasks.size}</span> task{addedTasks.size !== 1 ? 's' : ''} added
              </span>
            </div>

            {selectedTasks.size > 0 && (
              <button
                onClick={handleAddSelectedTasks}
                disabled={addingAll}
                className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 transition-opacity disabled:opacity-50 shadow-md"
                style={{ fontFamily: 'Poppins' }}
              >
                {addingAll ? (
                  <span className="flex items-center gap-2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Adding...
                  </span>
                ) : (
                  `Add ${selectedTasks.size} Selected Task${selectedTasks.size > 1 ? 's' : ''}`
                )}
              </button>
            )}
          </div>
        </div>

        {/* Library Grid */}
        {libraryTasks.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl shadow-sm">
            <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
              No library tasks available yet
            </h3>
            <p className="text-gray-600 mb-6" style={{ fontFamily: 'Poppins' }}>
              The library is built from AI-generated tasks. Generate custom tasks to contribute to the library!
            </p>
            <button
              onClick={handleDone}
              className="px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:opacity-90 transition-opacity"
              style={{ fontFamily: 'Poppins' }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
              {libraryTasks.map((task) => {
                const pillarData = getPillarData(task.pillar);
                const isAdded = addedTasks.has(task.id);
                const isSelected = selectedTasks.has(task.id);

                return (
                  <div
                    key={task.id}
                    onClick={() => !isAdded && toggleTaskSelection(task.id)}
                    className={`relative rounded-xl overflow-hidden transition-all hover:shadow-lg cursor-pointer border-2 ${
                      isSelected ? 'ring-2 ring-optio-purple' : ''
                    }`}
                    style={{
                      background: isAdded
                        ? '#f0fdf4'
                        : isSelected
                          ? `linear-gradient(135deg, ${pillarData.color}20 0%, ${pillarData.color}10 100%)`
                          : `linear-gradient(135deg, ${pillarData.color}15 0%, ${pillarData.color}05 100%)`,
                      borderColor: isSelected ? '#6D469B' : isAdded ? '#10b981' : '#e5e7eb'
                    }}
                  >
                    {/* Card Content */}
                    <div className="p-4">
                      {/* Checkbox and Added Badge */}
                      <div className="flex items-center justify-between mb-3">
                        {isAdded ? (
                          <span className="flex items-center gap-1 text-green-600 font-semibold text-sm" style={{ fontFamily: 'Poppins' }}>
                            <CheckCircle className="w-4 h-4" />
                            Already Added
                          </span>
                        ) : (
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleTaskSelection(task.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="w-5 h-5 text-optio-purple rounded focus:ring-optio-purple cursor-pointer"
                          />
                        )}
                      </div>

                      {/* Task Title */}
                      <h3 className="text-lg font-bold text-gray-900 mb-2 leading-tight" style={{ fontFamily: 'Poppins' }}>
                        {task.title}
                      </h3>

                      {/* Task Description */}
                      {task.description && (
                        <p className="text-sm text-gray-700 mb-3 line-clamp-3" style={{ fontFamily: 'Poppins' }}>
                          {task.description}
                        </p>
                      )}

                      {/* Pillar Badge + XP Badge Row */}
                      <div className="flex items-center gap-2 mb-2">
                        <div
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold text-white"
                          style={{ backgroundColor: pillarData.color }}
                        >
                          <span>{pillarData.icon}</span>
                          <span style={{ fontFamily: 'Poppins' }}>{pillarData.name}</span>
                        </div>
                        <div
                          className="px-3 py-1 rounded-full text-sm font-bold"
                          style={{
                            backgroundColor: `${pillarData.color}20`,
                            color: pillarData.color
                          }}
                        >
                          {task.xp_value} XP
                        </div>
                      </div>

                      {/* Usage Count and View Details Button */}
                      <div className="flex items-center justify-between mt-3">
                        {task.usage_count > 0 ? (
                          <p className="text-xs text-gray-500" style={{ fontFamily: 'Poppins' }}>
                            {task.usage_count} {task.usage_count === 1 ? 'student has' : 'students have'} used this
                          </p>
                        ) : (
                          <div></div>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailsModalTask(task);
                          }}
                          className="flex items-center gap-1 text-sm text-gray-600 hover:text-optio-purple transition-colors"
                          style={{ fontFamily: 'Poppins' }}
                        >
                          <Eye className="w-4 h-4" />
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Done Button */}
            <div className="text-center">
              <button
                onClick={handleDone}
                className="px-8 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold text-lg hover:opacity-90 transition-opacity shadow-md"
                style={{ fontFamily: 'Poppins' }}
              >
                Done - Return to Quest
              </button>
            </div>
          </>
        )}
      </div>

      {/* Task Details Modal */}
      {detailsModalTask && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            {/* Modal Header */}
            <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins' }}>
                Task Details
              </h2>
              <button
                onClick={() => setDetailsModalTask(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="w-6 h-6 text-gray-500" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-6">
              {(() => {
                const pillarData = getPillarData(detailsModalTask.pillar);
                return (
                  <>
                    {/* Task Title */}
                    <h3 className="text-2xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins' }}>
                      {detailsModalTask.title}
                    </h3>

                    {/* Pillar and XP Badges */}
                    <div className="flex items-center gap-2 mb-6">
                      <div
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-full text-sm font-semibold text-white"
                        style={{ backgroundColor: pillarData.color }}
                      >
                        <span>{pillarData.icon}</span>
                        <span style={{ fontFamily: 'Poppins' }}>{pillarData.name}</span>
                      </div>
                      <div
                        className="px-4 py-2 rounded-full text-sm font-bold"
                        style={{
                          backgroundColor: `${pillarData.color}20`,
                          color: pillarData.color
                        }}
                      >
                        {detailsModalTask.xp_value} XP
                      </div>
                    </div>

                    {/* Task Description */}
                    <div className="mb-6">
                      <h4 className="text-lg font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
                        Description
                      </h4>
                      <p className="text-gray-700 leading-relaxed whitespace-pre-wrap" style={{ fontFamily: 'Poppins' }}>
                        {detailsModalTask.description}
                      </p>
                    </div>

                    {/* Usage Stats */}
                    {detailsModalTask.usage_count > 0 && (
                      <div className="bg-gray-50 rounded-lg p-4 mb-6">
                        <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins' }}>
                          <span className="font-semibold">{detailsModalTask.usage_count}</span>{' '}
                          {detailsModalTask.usage_count === 1 ? 'student has' : 'students have'} completed this task
                        </p>
                      </div>
                    )}

                    {/* Action Buttons */}
                    <div className="flex gap-3">
                      {!addedTasks.has(detailsModalTask.id) && (
                        <button
                          onClick={async () => {
                            try {
                              await api.post(`/api/quests/${questId}/task-library/select`, {
                                sample_task_id: detailsModalTask.id
                              });
                              setAddedTasks(prev => new Set([...prev, detailsModalTask.id]));
                              toast.success('Task added to your quest!');
                              setDetailsModalTask(null);
                            } catch (error) {
                              console.error('Error adding task:', error);
                              toast.error(error.response?.data?.error || 'Failed to add task');
                            }
                          }}
                          className="flex-1 py-3 rounded-lg font-semibold text-white hover:opacity-90 transition-opacity"
                          style={{
                            backgroundColor: pillarData.color,
                            fontFamily: 'Poppins'
                          }}
                        >
                          Add to My Quest
                        </button>
                      )}
                      <button
                        onClick={() => setDetailsModalTask(null)}
                        className="flex-1 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
                        style={{ fontFamily: 'Poppins' }}
                      >
                        Close
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
