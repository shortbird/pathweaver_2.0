import { useState, useRef, useEffect } from 'react';
import { TrophyIcon, PhotoIcon, VideoCameraIcon, LinkIcon, DocumentTextIcon, ExclamationCircleIcon, CheckCircleIcon, BookOpenIcon, ChevronDownIcon, PlusIcon, DocumentIcon } from '@heroicons/react/24/outline';
import confetti from 'canvas-confetti';
import MultiFormatEvidenceEditor from '../evidence/MultiFormatEvidenceEditor';
import { getPillarData } from '../../utils/pillarMappings';
import logger from '../../utils/logger';

const TaskWorkspace = ({ task, questId, onTaskComplete, onClose }) => {
  const [error, setError] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const editorRef = useRef(null);

  // Debug: Log task prop changes
  useEffect(() => {
    logger.debug('[TASK_WORKSPACE] Task prop changed:', {
      id: task?.id?.substring(0, 8),
      title: task?.title,
      is_completed: task?.is_completed,
      timestamp: new Date().toISOString()
    });
  }, [task]);

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <BookOpenIcon className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg" style={{ fontFamily: 'Poppins' }}>Select a task to get started</p>
        </div>
      </div>
    );
  }

  const pillarData = getPillarData(task.pillar);
  const isTaskCompleted = task.is_completed || false;

  console.log('[TASK_WORKSPACE] Render with isTaskCompleted:', isTaskCompleted);

  const handleMarkComplete = async () => {
    if (isCompleting) return;

    setIsCompleting(true);

    try {
      // Trigger the editor's submit function
      if (editorRef.current && editorRef.current.submitTask) {
        await editorRef.current.submitTask();
      }

      // Fire confetti celebration
      const duration = 2000;
      const animationEnd = Date.now() + duration;
      const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

      function randomInRange(min, max) {
        return Math.random() * (max - min) + min;
      }

      const interval = setInterval(function() {
        const timeLeft = animationEnd - Date.now();

        if (timeLeft <= 0) {
          clearInterval(interval);
          return;
        }

        const particleCount = 50 * (timeLeft / duration);

        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
          colors: [pillarData.color, '#6D469B', '#EF597B', '#FFD700']
        });
        confetti({
          ...defaults,
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
          colors: [pillarData.color, '#6D469B', '#EF597B', '#FFD700']
        });
      }, 250);

      // DO NOT call onTaskComplete here - it will be called by handleComplete
      // when the evidence document is actually saved with status='completed'
      // Calling it here causes the task to be marked complete in UI before save
    } catch (err) {
      logger.error('Error completing task:', err);
      setError(err.message || 'Failed to complete task');
    } finally {
      setIsCompleting(false);
    }
  };

  const handleComplete = (data) => {
    // Called by MultiFormatEvidenceEditor when task is submitted
    if (onTaskComplete) {
      onTaskComplete({
        task,
        ...data
      });
    }
  };

  const handleError = (errorMessage) => {
    setError(errorMessage);
  };

  const handleAddBlock = (type) => {
    if (editorRef.current && editorRef.current.addBlock) {
      editorRef.current.addBlock(type);
    }
    setShowBlockMenu(false); // Close menu after selection
  };

  const blockTypes = {
    text: { icon: DocumentTextIcon, label: 'Text' },
    image: { icon: PhotoIcon, label: 'Image' },
    video: { icon: VideoCameraIcon, label: 'Video' },
    link: { icon: LinkIcon, label: 'Link' },
    document: { icon: DocumentIcon, label: 'Document' }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Compact Header Section */}
      <div className="px-6 py-4 border-b border-gray-200">
        {/* Title + Badges on Same Line */}
        <div className="flex items-start justify-between mb-3">
          <h2 className="text-2xl font-bold text-gray-900 flex-1 mr-4" style={{ fontFamily: 'Poppins' }}>
            {task.title}
          </h2>
          <div className="flex items-center gap-2 flex-shrink-0">
            <div
              className="px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide text-white"
              style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
            >
              {pillarData.name}
            </div>
            <div
              className="px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1.5"
              style={{
                backgroundColor: `${pillarData.color}20`,
                color: pillarData.color,
                fontFamily: 'Poppins'
              }}
            >
              <TrophyIcon className="w-3.5 h-3.5" />
              {task.xp_amount} XP
            </div>
          </div>
        </div>

        {/* Collapsible Task Description */}
        {task.description && (
          <div className="text-gray-700 text-sm leading-relaxed" style={{ fontFamily: 'Poppins' }}>
            <div className={descriptionExpanded ? '' : 'line-clamp-3'}>
              {task.description.split('\n').map((line, idx) => {
                const trimmedLine = line.trim();
                if (trimmedLine.startsWith('•')) {
                  return (
                    <div key={idx} className="flex items-start mb-1.5">
                      <span className="mr-2 mt-0.5 text-base font-bold" style={{ color: pillarData.color }}>•</span>
                      <span className="text-gray-700" style={{ fontFamily: 'Poppins' }}>{trimmedLine.substring(1).trim()}</span>
                    </div>
                  );
                } else if (trimmedLine) {
                  return (
                    <p key={idx} className="mb-1.5">{trimmedLine}</p>
                  );
                }
                return null;
              })}
            </div>
            {task.description.length > 150 && (
              <button
                onClick={() => setDescriptionExpanded(!descriptionExpanded)}
                className="text-xs font-semibold mt-1 hover:underline"
                style={{ color: pillarData.color, fontFamily: 'Poppins' }}
              >
                {descriptionExpanded ? 'Show less' : 'Read more'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* Content Section - Scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <ExclamationCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <span className="text-red-700 text-sm font-medium" style={{ fontFamily: 'Poppins' }}>{error}</span>
            </div>
          </div>
        )}

        {/* Evidence Section with Sticky Toolbar */}
        <div className="mb-6">
          {/* Header with Save Status and Add Content Dropdown */}
          <div className="flex items-center justify-between mb-3 sticky top-0 bg-white z-10 py-2 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <h3 className="text-lg font-semibold text-gray-900" style={{ fontFamily: 'Poppins' }}>
                Your Evidence
              </h3>

              {/* Save Status from Editor - passed via ref callback */}
              <div className="flex items-center gap-2 text-xs" id="evidence-save-status">
                {/* This will be populated by the editor */}
              </div>
            </div>

            {/* Add Content Dropdown Button */}
            <div className="relative">
              <button
                onClick={() => setShowBlockMenu(!showBlockMenu)}
                className="px-4 py-2 rounded-lg border-2 transition-all duration-200 hover:shadow-md bg-white flex items-center gap-2 text-sm font-semibold"
                style={{
                  borderColor: pillarData.color,
                  color: pillarData.color,
                  fontFamily: 'Poppins'
                }}
              >
                <PlusIcon className="w-4 h-4" />
                Add Content
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showBlockMenu ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {showBlockMenu && (
                <>
                  {/* Backdrop to close menu */}
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setShowBlockMenu(false)}
                  />

                  {/* Menu */}
                  <div
                    className="absolute right-0 top-full mt-2 w-48 bg-white shadow-xl rounded-lg border-2 overflow-hidden z-20"
                    style={{ borderColor: `${pillarData.color}40` }}
                  >
                    {Object.entries(blockTypes).map(([type, config]) => {
                      const IconComponent = config.icon;
                      return (
                        <button
                          key={type}
                          onClick={() => handleAddBlock(type)}
                          className="w-full px-4 py-3 hover:bg-gray-50 flex items-center gap-3 text-sm font-semibold text-left transition-colors"
                          style={{
                            color: pillarData.color,
                            fontFamily: 'Poppins'
                          }}
                        >
                          <IconComponent className="w-4 h-4" />
                          {config.label}
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>

          <MultiFormatEvidenceEditor
            ref={editorRef}
            taskId={task.id}
            userId={null}
            legacyEvidenceText={task.evidence_text}
            onComplete={handleComplete}
            onError={handleError}
            autoSaveEnabled={true}
            hideHeader={true}
          />
        </div>

        {/* Public Evidence Notice - Subtle */}
        <div className="border-l-4 rounded-r-lg pl-4 py-3 mb-6 bg-gray-50" style={{ borderColor: pillarData.color }}>
          <p className="text-gray-600 text-xs leading-relaxed flex items-start gap-2" style={{ fontFamily: 'Poppins' }}>
            <ExclamationCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: pillarData.color }} />
            <span>
              This evidence will appear on your <strong>public portfolio</strong>. Make sure your content showcases your best work.
            </span>
          </p>
        </div>
      </div>

      {/* Footer Section - Sticky Action Button */}
      <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
        {!isTaskCompleted ? (
          <button
            onClick={handleMarkComplete}
            disabled={isCompleting}
            className="w-full py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full font-bold text-base hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            style={{ fontFamily: 'Poppins' }}
          >
            {isCompleting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Marking Complete...
              </>
            ) : (
              <>
                <CheckCircleIcon className="w-5 h-5" />
                Mark Task as Completed
              </>
            )}
          </button>
        ) : (
          <div className="space-y-2">
            <div className="w-full py-3 bg-green-50 border-2 border-green-300 rounded-full flex items-center justify-center gap-2">
              <CheckCircleIcon className="w-5 h-5 text-green-600" />
              <span className="text-green-700 font-bold text-base" style={{ fontFamily: 'Poppins' }}>
                Task Completed! +{task.xp_amount} XP Earned
              </span>
            </div>
            <p className="text-xs text-center text-gray-600" style={{ fontFamily: 'Poppins' }}>
              You can still edit your evidence above. Changes save automatically.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskWorkspace;
