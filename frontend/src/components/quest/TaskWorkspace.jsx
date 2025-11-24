import { useState, useRef } from 'react';
import { Award, Type, Image, Video, Link2, FileText, AlertCircle, CheckCircle } from 'lucide-react';
import confetti from 'canvas-confetti';
import MultiFormatEvidenceEditor from '../evidence/MultiFormatEvidenceEditor';
import { getPillarData } from '../../utils/pillarMappings';

const TaskWorkspace = ({ task, questId, onTaskComplete, onClose }) => {
  const [error, setError] = useState('');
  const [isCompleting, setIsCompleting] = useState(false);
  const editorRef = useRef(null);

  if (!task) {
    return (
      <div className="h-full flex items-center justify-center text-gray-400">
        <div className="text-center">
          <BookOpen className="w-16 h-16 mx-auto mb-4 opacity-50" />
          <p className="text-lg" style={{ fontFamily: 'Poppins' }}>Select a task to get started</p>
        </div>
      </div>
    );
  }

  const pillarData = getPillarData(task.pillar);
  const isTaskCompleted = task.is_completed || false;

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

      // Call parent callback
      if (onTaskComplete) {
        onTaskComplete(task);
      }
    } catch (err) {
      console.error('Error completing task:', err);
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
  };

  const blockTypes = {
    text: { icon: Type, label: 'Text' },
    image: { icon: Image, label: 'Image' },
    video: { icon: Video, label: 'Video' },
    link: { icon: Link2, label: 'Link' },
    document: { icon: FileText, label: 'Document' }
  };

  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header Section */}
      <div className="px-6 py-6 border-b border-gray-200">
        {/* Task Title */}
        <h2 className="text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins' }}>
          {task.title}
        </h2>

        {/* Pillar Badge + XP Badge */}
        <div className="flex items-center gap-3 mb-4">
          <div
            className="px-4 py-1.5 rounded-full text-sm font-semibold uppercase tracking-wide text-white"
            style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
          >
            {pillarData.name}
          </div>
          <div
            className="px-4 py-1.5 rounded-full text-sm font-bold flex items-center gap-2"
            style={{
              backgroundColor: `${pillarData.color}20`,
              color: pillarData.color,
              fontFamily: 'Poppins'
            }}
          >
            <Award className="w-4 h-4" />
            {task.xp_amount} XP
          </div>
        </div>

        {/* Pillar-colored accent line */}
        <div className="h-1 rounded-full mb-4" style={{ backgroundColor: pillarData.color }} />

        {/* Task Description */}
        {task.description && (
          <div className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>
            {task.description.split('\n').map((line, idx) => {
              const trimmedLine = line.trim();
              if (trimmedLine.startsWith('•')) {
                return (
                  <div key={idx} className="flex items-start mb-2">
                    <span className="mr-3 mt-1 text-lg font-bold" style={{ color: pillarData.color }}>•</span>
                    <span className="text-gray-700" style={{ fontFamily: 'Poppins' }}>{trimmedLine.substring(1).trim()}</span>
                  </div>
                );
              } else if (trimmedLine) {
                return (
                  <p key={idx} className="mb-2">{trimmedLine}</p>
                );
              }
              return null;
            })}
          </div>
        )}
      </div>

      {/* Content Section - Scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-6">
        {/* Error Display */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-2 border-red-200 rounded-xl">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              <span className="text-red-700 text-sm font-medium" style={{ fontFamily: 'Poppins' }}>{error}</span>
            </div>
          </div>
        )}

        {/* Evidence Section */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-3" style={{ fontFamily: 'Poppins' }}>
            Your Evidence
          </h3>

          <MultiFormatEvidenceEditor
            ref={editorRef}
            taskId={task.id}
            userId={null}
            legacyEvidenceText={task.evidence_text}
            onComplete={handleComplete}
            onError={handleError}
            autoSaveEnabled={true}
          />
        </div>

        {/* Add Content Block Section */}
        <div className="mb-6">
          <span className="text-sm font-semibold text-gray-700 mb-2 block" style={{ fontFamily: 'Poppins' }}>
            Add new content block
          </span>
          <div className="flex flex-wrap gap-2">
            {Object.entries(blockTypes).map(([type, config]) => {
              const IconComponent = config.icon;
              return (
                <button
                  key={type}
                  onClick={() => handleAddBlock(type)}
                  className="px-4 py-2 rounded-lg border-2 transition-all duration-200 hover:shadow-md bg-white flex items-center gap-2 text-sm font-semibold"
                  style={{
                    borderColor: pillarData.color,
                    color: pillarData.color,
                    fontFamily: 'Poppins'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = pillarData.color;
                    e.currentTarget.style.color = 'white';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'white';
                    e.currentTarget.style.color = pillarData.color;
                  }}
                >
                  <IconComponent className="w-4 h-4" />
                  <span>{config.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Public Evidence Notice */}
        <div
          className="border-2 rounded-xl p-4 mb-6"
          style={{
            backgroundColor: `${pillarData.color}10`,
            borderColor: pillarData.color
          }}
        >
          <h4 className="font-bold text-base mb-2 flex items-center gap-2" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>
            <AlertCircle className="w-5 h-5" />
            Your Evidence Is Public
          </h4>
          <p className="text-gray-700 text-sm leading-relaxed" style={{ fontFamily: 'Poppins' }}>
            This evidence will appear on your <strong>public portfolio</strong> for others to see. Make sure your content reflects well on you and showcases your best efforts.
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
                <CheckCircle className="w-5 h-5" />
                Mark Task as Completed
              </>
            )}
          </button>
        ) : (
          <div className="w-full py-3 bg-green-50 border-2 border-green-300 rounded-full flex items-center justify-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <span className="text-green-700 font-bold text-base" style={{ fontFamily: 'Poppins' }}>
              Task Completed! +{task.xp_amount} XP Earned
            </span>
          </div>
        )}
      </div>
    </div>
  );
};

export default TaskWorkspace;
