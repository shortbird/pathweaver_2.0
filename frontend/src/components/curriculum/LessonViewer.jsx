import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircleIcon, ClockIcon, PlayIcon, DocumentTextIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { getPillarData } from '../../utils/pillarMappings';
import LessonContentRenderer from './LessonContentRenderer';

/**
 * LessonViewer Component
 * Displays lesson content with markdown, embedded videos, and linked tasks
 * Tracks time spent and allows marking as complete
 */
const LessonViewer = ({
  lesson,
  linkedTasks = [],
  progress = null,
  onComplete,
  onUpdateProgress,
  isCompleting = false
}) => {
  const navigate = useNavigate();
  const [timeSpent, setTimeSpent] = useState(progress?.time_spent_seconds || 0);
  const timerRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  // Track time spent on lesson
  useEffect(() => {
    startTimeRef.current = Date.now();

    // Update timer every second
    timerRef.current = setInterval(() => {
      setTimeSpent(prev => prev + 1);
    }, 1000);

    // Cleanup: save time on unmount
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }

      // Calculate final time spent
      const sessionTime = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const totalTime = (progress?.time_spent_seconds || 0) + sessionTime;

      // Save progress on unmount
      if (onUpdateProgress && lesson?.id) {
        onUpdateProgress({
          lessonId: lesson.id,
          progressData: {
            time_spent_seconds: totalTime,
            status: progress?.status === 'completed' ? 'completed' : 'in_progress'
          }
        });
      }
    };
  }, [lesson?.id]);

  // Format time for display
  const formatTime = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hrs > 0) {
      return `${hrs}h ${mins}m`;
    } else if (mins > 0) {
      return `${mins}m ${secs}s`;
    }
    return `${secs}s`;
  };

  // Handle mark as complete
  const handleComplete = () => {
    if (onComplete) {
      onComplete({
        lessonId: lesson.id,
        progressData: {
          status: 'completed',
          time_spent_seconds: timeSpent,
          completed_at: new Date().toISOString()
        }
      });
    }
  };

  // Render content block based on type
  const renderContentBlock = (block, index) => {
    switch (block.type) {
      case 'text':
        return (
          <LessonContentRenderer key={index} content={block.content} />
        );

      case 'iframe':
        return (
          <div key={index} className="my-6">
            {block.data?.title && (
              <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center gap-2">
                <PlayIcon className="w-5 h-5 text-optio-purple" />
                {block.data.title}
              </h4>
            )}
            <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden shadow-md">
              <iframe
                src={block.content || block.data?.url}
                title={block.data?.title || 'Embedded content'}
                className="absolute inset-0 w-full h-full"
                allowFullScreen
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
          </div>
        );

      case 'document':
        return (
          <div key={index} className="my-6">
            <a
              href={block.content || block.data?.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all group"
            >
              <div className="p-3 bg-white rounded-lg shadow-sm group-hover:shadow-md transition-shadow">
                <DocumentTextIcon className="w-6 h-6 text-optio-purple" />
              </div>
              <div>
                <p className="font-medium text-gray-900 group-hover:text-optio-purple transition-colors">
                  {block.data?.title || 'View Document'}
                </p>
                <p className="text-sm text-gray-500">Click to open in new tab</p>
              </div>
            </a>
          </div>
        );

      default:
        return null;
    }
  };

  const isCompleted = progress?.status === 'completed';
  const contentBlocks = lesson?.content?.blocks || [];

  return (
    <div className="max-w-4xl mx-auto">
      {/* Lesson Header */}
      <div className="mb-8">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
              {lesson?.title}
            </h1>
            {lesson?.description && (
              <p className="text-lg text-gray-600">{lesson.description}</p>
            )}
          </div>

          {/* Completion Status Badge */}
          {isCompleted && (
            <div className="flex items-center gap-2 px-4 py-2 bg-green-50 text-green-700 rounded-full">
              <CheckCircleSolidIcon className="w-5 h-5" />
              <span className="font-medium">Completed</span>
            </div>
          )}
        </div>

        {/* Time Indicators */}
        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
          {lesson?.estimated_duration_minutes && (
            <div className="flex items-center gap-2">
              <ClockIcon className="w-4 h-4" />
              <span>Estimated: {lesson.estimated_duration_minutes} min</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <ClockIcon className="w-4 h-4 text-optio-purple" />
            <span>Time spent: {formatTime(timeSpent)}</span>
          </div>
        </div>
      </div>

      {/* Lesson Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
        {contentBlocks.length > 0 ? (
          <div className="space-y-6">
            {contentBlocks.map((block, index) => renderContentBlock(block, index))}
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">
            <DocumentTextIcon className="w-12 h-12 mx-auto mb-4 text-gray-300" />
            <p>No content available for this lesson yet.</p>
          </div>
        )}
      </div>

      {/* Linked Tasks */}
      {linkedTasks.length > 0 && (
        <div className="mb-8">
          <h3 className="text-xl font-semibold text-gray-900 mb-4" style={{ fontFamily: 'Poppins' }}>
            Related Tasks
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {linkedTasks.map((task) => {
              const pillarData = getPillarData(task.pillar || 'wellness');
              return (
                <button
                  key={task.id}
                  onClick={() => navigate(`/quests/${task.quest_id}`, { state: { selectedTaskId: task.id } })}
                  className={`p-4 rounded-lg border-2 ${pillarData.border} ${pillarData.bg} text-left hover:shadow-md transition-all group`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className={`font-medium ${pillarData.text} group-hover:opacity-80 transition-opacity`}>
                        {task.title}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        <span className={`text-xs font-medium px-2 py-1 rounded-full ${pillarData.bg} ${pillarData.text}`}>
                          {pillarData.icon} {pillarData.name}
                        </span>
                        {task.xp_amount && (
                          <span className="text-xs text-gray-500">
                            {task.xp_amount} XP
                          </span>
                        )}
                      </div>
                    </div>
                    {task.is_completed && (
                      <CheckCircleSolidIcon className="w-6 h-6 text-green-500 flex-shrink-0" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Mark as Complete Button */}
      {!isCompleted && (
        <div className="flex justify-center pb-8">
          <button
            onClick={handleComplete}
            disabled={isCompleting}
            className="flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full text-lg font-semibold hover:shadow-lg hover:scale-105 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            style={{ fontFamily: 'Poppins' }}
          >
            {isCompleting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                Marking Complete...
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-6 h-6" />
                Mark as Complete
              </>
            )}
          </button>
        </div>
      )}

      {/* Already Completed Message */}
      {isCompleted && (
        <div className="text-center pb-8">
          <div className="inline-flex items-center gap-2 px-6 py-3 bg-green-50 text-green-700 rounded-full">
            <CheckCircleSolidIcon className="w-6 h-6" />
            <span className="font-medium">You've completed this lesson!</span>
          </div>
          {progress?.completed_at && (
            <p className="mt-2 text-sm text-gray-500">
              Completed on {new Date(progress.completed_at).toLocaleDateString()}
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LessonViewer;
