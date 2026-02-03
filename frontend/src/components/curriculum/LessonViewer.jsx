import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircleIcon, ClockIcon, PlayIcon, DocumentTextIcon, LinkIcon, ArrowDownTrayIcon, VideoCameraIcon, AcademicCapIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { CheckCircleIcon as CheckCircleSolidIcon } from '@heroicons/react/24/solid';
import { getPillarData } from '../../utils/pillarMappings';
import LessonContentRenderer from './LessonContentRenderer';

// Age Adaptations Modal Component
const ScaffoldingModal = ({ isOpen, onClose, scaffolding }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AcademicCapIcon className="w-8 h-8" />
              <h2 className="text-xl font-bold" style={{ fontFamily: 'Poppins' }}>
                Age Adaptations
              </h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-full transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
          <p className="mt-2 text-white/80 text-sm">
            Tips for adapting this lesson for different age groups
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[60vh]">
          {/* Younger learners */}
          <div className="bg-blue-50 rounded-xl p-5 border border-blue-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🧒</span>
              <h3 className="font-semibold text-blue-900" style={{ fontFamily: 'Poppins' }}>
                Younger Learners (Ages 8-10)
              </h3>
            </div>
            <p className="text-blue-800 leading-relaxed">
              {scaffolding?.younger || 'No specific adaptations provided for younger learners.'}
            </p>
          </div>

          {/* Older learners */}
          <div className="bg-purple-50 rounded-xl p-5 border border-purple-100">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🧑‍🎓</span>
              <h3 className="font-semibold text-purple-900" style={{ fontFamily: 'Poppins' }}>
                Older Learners (Ages 14-18)
              </h3>
            </div>
            <p className="text-purple-800 leading-relaxed">
              {scaffolding?.older || 'No specific adaptations provided for older learners.'}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 p-4 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium hover:shadow-lg transition-shadow"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};

// Helper to extract YouTube/Vimeo embed URL
const getEmbedUrl = (url) => {
  if (!url) return null;

  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`;
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`;
  }

  // Google Drive
  if (url.includes('drive.google.com')) {
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (driveMatch) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
    }
  }

  // Loom
  if (url.includes('loom.com')) {
    const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/);
    if (loomMatch) {
      return `https://www.loom.com/embed/${loomMatch[1]}`;
    }
  }

  return url;
};

// Step renderer component for version 2 format
const StepRenderer = ({ step, stepNumber }) => {
  const embedUrl = step.video_url ? getEmbedUrl(step.video_url) : null;

  return (
    <div className="mb-8 last:mb-0">
      {/* Step Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full text-sm font-bold">
          {stepNumber}
        </span>
        <h3 className="text-xl font-semibold text-gray-900" style={{ fontFamily: 'Poppins' }}>
          {step.title || `Step ${stepNumber}`}
        </h3>
      </div>

      {/* Step Content */}
      <div className="pl-11">
        {/* Text Content */}
        {step.content && (
          <div className="mb-4">
            <LessonContentRenderer content={step.content} />
          </div>
        )}

        {/* Video Embed */}
        {step.type === 'video' && embedUrl && (
          <div className="my-6">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <VideoCameraIcon className="w-4 h-4" />
              <span>Video</span>
            </div>
            <div className="relative w-full aspect-video bg-gray-100 rounded-lg overflow-hidden shadow-md">
              <iframe
                src={embedUrl}
                title={step.title || 'Video content'}
                className="absolute inset-0 w-full h-full"
                allowFullScreen
                loading="lazy"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>
          </div>
        )}

        {/* Files/Attachments */}
        {step.attachments && step.attachments.length > 0 && (
          <div className="my-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <ArrowDownTrayIcon className="w-4 h-4" />
              <span>Downloads</span>
            </div>
            <div className="space-y-2">
              {step.attachments.map((file, idx) => (
                <a
                  key={idx}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all group"
                >
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <DocumentTextIcon className="w-5 h-5 text-optio-purple" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 group-hover:text-optio-purple transition-colors truncate">
                      {file.name || 'Download File'}
                    </p>
                    {file.size && (
                      <p className="text-xs text-gray-500">{file.size}</p>
                    )}
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Files (alternative format) */}
        {step.files && step.files.length > 0 && (
          <div className="my-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <ArrowDownTrayIcon className="w-4 h-4" />
              <span>Files</span>
            </div>
            <div className="space-y-2">
              {step.files.map((file, idx) => (
                <a
                  key={idx}
                  href={file.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all group"
                >
                  <div className="p-2 bg-white rounded-lg shadow-sm">
                    <DocumentTextIcon className="w-5 h-5 text-optio-purple" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 group-hover:text-optio-purple transition-colors truncate">
                      {file.name || 'Download File'}
                    </p>
                  </div>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Links */}
        {step.links && step.links.length > 0 && (
          <div className="my-4">
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
              <LinkIcon className="w-4 h-4" />
              <span>Resources</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {step.links.map((link, idx) => (
                <a
                  key={idx}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-optio-purple/10 text-optio-purple rounded-lg hover:bg-optio-purple/20 transition-colors text-sm font-medium"
                >
                  <LinkIcon className="w-4 h-4" />
                  {link.text || link.url}
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

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
  const [timeSpent, setTimeSpent] = useState(progress?.time_spent_seconds || 0);
  const [showScaffoldingModal, setShowScaffoldingModal] = useState(false);
  const timerRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  // Extract scaffolding from lesson content
  const scaffolding = lesson?.content?.scaffolding;

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

  // Determine content format
  const isVersion2 = lesson?.content?.version === 2 && Array.isArray(lesson?.content?.steps);
  const steps = isVersion2 ? lesson.content.steps.sort((a, b) => (a.order || 0) - (b.order || 0)) : [];
  const contentBlocks = lesson?.content?.blocks || [];
  const hasContent = isVersion2 ? steps.length > 0 : contentBlocks.length > 0;

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

        {/* Time Indicators and Actions */}
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

          {/* Age Adaptations Button */}
          {scaffolding && (scaffolding.younger || scaffolding.older) && (
            <button
              onClick={() => setShowScaffoldingModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 text-optio-purple rounded-full hover:from-optio-purple/20 hover:to-optio-pink/20 transition-colors font-medium"
            >
              <AcademicCapIcon className="w-4 h-4" />
              <span>Age Adaptations</span>
            </button>
          )}
        </div>
      </div>

      {/* Lesson Content */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 mb-8">
        {hasContent ? (
          isVersion2 ? (
            // Version 2: Step-based format
            <div>
              {steps.map((step, index) => (
                <StepRenderer key={step.id || index} step={step} stepNumber={index + 1} />
              ))}
            </div>
          ) : (
            // Legacy: Blocks format
            <div className="space-y-6">
              {contentBlocks.map((block, index) => renderContentBlock(block, index))}
            </div>
          )
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
                <Link
                  key={task.id}
                  to={`/quests/${task.quest_id}?task=${task.id}`}
                  className={`block p-4 rounded-lg border-2 ${pillarData.border} ${pillarData.bg} text-left hover:shadow-md transition-colors transition-shadow duration-150 group`}
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
                </Link>
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

      {/* Age Adaptations Modal */}
      <ScaffoldingModal
        isOpen={showScaffoldingModal}
        onClose={() => setShowScaffoldingModal(false)}
        scaffolding={scaffolding}
      />
    </div>
  );
};

export default LessonViewer;
