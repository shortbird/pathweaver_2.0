import { useState, useRef } from 'react';
import { TrophyIcon, PhotoIcon, VideoCameraIcon, LinkIcon, DocumentTextIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import MultiFormatEvidenceEditor from '../evidence/MultiFormatEvidenceEditor';
import ModalErrorBoundary from '../ModalErrorBoundary';
import MobileModal from '../ui/mobile/MobileModal';
import { getPillarData } from '../../utils/pillarMappings';

const TaskEvidenceModal = ({ task, onComplete, onClose }) => {
  const [error, setError] = useState('');
  const editorRef = useRef(null);

  // Check if task is already completed
  const isTaskCompleted = task.is_completed || false;

  const handleComplete = (data) => {
    // Immediately call onComplete to close modal and update quest state
    onComplete({
      task,
      ...data
    });
  };

  const handleError = (errorMessage) => {
    setError(errorMessage);
  };

  const handleAddBlock = (type) => {
    // This will be called by the evidence editor via ref
    if (editorRef.current && editorRef.current.addBlock) {
      editorRef.current.addBlock(type);
    }
  };

  const handleSubmitForXP = () => {
    // Trigger submit via editor ref
    if (editorRef.current && editorRef.current.submitTask) {
      editorRef.current.submitTask();
    }
  };

  const pillarData = getPillarData(task.pillar);

  const blockTypes = {
    text: { icon: DocumentTextIcon, label: 'Text' },
    image: { icon: PhotoIcon, label: 'Image' },
    video: { icon: VideoCameraIcon, label: 'Video' },
    link: { icon: LinkIcon, label: 'Link' },
    document: { icon: DocumentTextIcon, label: 'Document' }
  };

  return (
    <ModalErrorBoundary onClose={onClose}>
      <MobileModal
        isOpen={true}
        onClose={onClose}
        fullScreenOnMobile={true}
        enableSwipeClose={true}
        safeAreaPadding={true}
        size="xl"
        showCloseButton={false}
        bodyClassName="p-0"
        header={
          <div className="flex-1">
            <h3 className="text-xl sm:text-2xl font-bold text-white mb-2" style={{ fontFamily: 'Poppins' }}>
              {task.title}
            </h3>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-xs sm:text-sm font-semibold uppercase tracking-wide text-white/90" style={{ fontFamily: 'Poppins' }}>
                {getPillarData(task.pillar).name}
              </div>
              <div
                className="px-3 py-1 rounded-full text-xs sm:text-sm font-bold flex items-center gap-2 bg-white/20 text-white"
                style={{ fontFamily: 'Poppins' }}
              >
                <TrophyIcon className="w-4 h-4" />
                {task.xp_amount} XP
              </div>
            </div>
          </div>
        }
      >
        <div className="flex flex-col h-full">
            {/* Task description section */}
            {task.description && (
              <div className="px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-200 bg-white">
                <div className="text-gray-600 text-sm sm:text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>
                  {task.description.split('\n').map((line, idx) => {
                    const trimmedLine = line.trim();
                    if (trimmedLine.startsWith('•')) {
                      return (
                        <div key={idx} className="flex items-start mb-2">
                          <span className="mr-3 mt-1 text-lg font-bold" style={{ color: pillarData.color }}>•</span>
                          <span className="text-gray-600" style={{ fontFamily: 'Poppins' }}>{trimmedLine.substring(1).trim()}</span>
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
              </div>
            )}

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto bg-gray-50">
              {/* Add Content Block Section with Submit Button or Completion Indicator */}
              <div className="sticky top-0 z-10 px-4 sm:px-8 py-4 sm:py-6 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-3">
                  <span className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Poppins' }}>Add new content block</span>
                  {!isTaskCompleted && (
                    <button
                      onClick={handleSubmitForXP}
                      className="px-4 sm:px-6 py-2 bg-gradient-primary text-white rounded-lg font-bold hover:shadow-lg transition-all flex items-center gap-2 w-full sm:w-auto justify-center touch-manipulation min-h-[44px]"
                      style={{ fontFamily: 'Poppins' }}
                    >
                      <TrophyIcon className="w-4 h-4" />
                      Submit for XP
                    </button>
                  )}
                  {isTaskCompleted && (
                    <div className="px-4 sm:px-6 py-2 bg-green-50 border-2 border-green-200 rounded-lg flex items-center gap-2 w-full sm:w-auto justify-center">
                      <div className="w-5 h-5 bg-green-500 rounded-full flex items-center justify-center flex-shrink-0">
                        <svg className="w-3 h-3 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                      <span className="text-green-700 font-bold text-sm" style={{ fontFamily: 'Poppins' }}>
                        Task Completed
                      </span>
                    </div>
                  )}
                </div>
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

              {/* Content */}
              <div className="px-4 sm:px-8 py-4 sm:py-6 space-y-6">
              {/* Error Display */}
              {error && (
                <div className="p-6 bg-red-50 border-2 border-red-200 rounded-xl">
                  <div className="flex items-start gap-3">
                    <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-6 h-6 text-red-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <span className="text-red-700 text-base font-medium" style={{ fontFamily: 'Poppins' }}>{error}</span>
                  </div>
                </div>
              )}

              {/* Evidence Document Blocks */}
              <div>
                <MultiFormatEvidenceEditor
                  ref={editorRef}
                  taskId={task.id}
                  userId={null} // Will be extracted from auth token
                  legacyEvidenceText={task.evidence_text} // Pass text evidence from quest_task_completions
                  onComplete={handleComplete}
                  onError={handleError}
                  autoSaveEnabled={true}
                />
              </div>

              {/* Your Evidence Is Public - Bottom message */}
              <div
                className="border-2 rounded-xl p-6"
                style={{
                  backgroundColor: `${pillarData.color}10`,
                  borderColor: pillarData.color
                }}
              >
                <h4 className="font-bold text-lg mb-3 flex items-center gap-2" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>
                  <ExclamationCircleIcon className="w-5 h-5" />
                  Your Evidence Is Public
                </h4>
                <p className="text-gray-700 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>
                  This evidence will appear on your <strong>public portfolio</strong> for others to see. Make sure your content reflects well on you and showcases your best efforts.
                </p>
              </div>
            </div>
          </div>
        </div>
      </MobileModal>
    </ModalErrorBoundary>
  );
};

export default TaskEvidenceModal;
