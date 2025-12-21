import { useState, useRef } from 'react';
import { TrophyIcon, PhotoIcon, VideoCameraIcon, LinkIcon, DocumentTextIcon, ExclamationCircleIcon } from '@heroicons/react/24/outline';
import MultiFormatEvidenceEditor from '../evidence/MultiFormatEvidenceEditor';
import ModalErrorBoundary from '../ModalErrorBoundary';
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
    text: { icon: Type, label: 'Text' },
    image: { icon: Image, label: 'Image' },
    video: { icon: Video, label: 'Video' },
    link: { icon: Link2, label: 'Link' },
    document: { icon: FileText, label: 'Document' }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        ></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        {/* Modal panel */}
        <ModalErrorBoundary onClose={onClose}>
          <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-4xl sm:w-full max-h-[85vh] flex flex-col">
            {/* Header - White background with pillar color accent */}
            <div className="px-8 py-8 border-b border-gray-200 flex-shrink-0">
              <div className="flex items-start justify-between mb-6">
                <div className="flex-1">
                  {/* Row 1: Task title */}
                  <h3 className="text-3xl font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins' }}>{task.title}</h3>

                  {/* Row 2: Pillar name and XP pill */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="text-sm font-semibold uppercase tracking-wide" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>
                      {pillarData.name}
                    </div>
                    <div
                      className="px-4 py-1 rounded-full text-sm font-bold flex items-center gap-2"
                      style={{
                        backgroundColor: `${pillarData.color}20`,
                        color: pillarData.color,
                        fontFamily: 'Poppins'
                      }}
                    >
                      <TrophyIcon className="w-4 h-4" />
                      {task.xp_amount} XP
                    </div>
                  </div>

                  {/* Row 3: Task description */}
                  {task.description && (
                    <div className="text-gray-600 text-base leading-relaxed" style={{ fontFamily: 'Poppins' }}>
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
                  )}
                </div>

                {/* Save & Close button (replaced X) */}
                <button
                  onClick={onClose}
                  className="ml-4 px-6 py-2 text-white rounded-lg hover:shadow-lg transition-all font-semibold whitespace-nowrap"
                  style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                >
                  Save & Close
                </button>
              </div>
            </div>

            {/* Scrollable content area */}
            <div className="flex-1 overflow-y-auto">
              {/* Add Content Block Section with Submit Button or Completion Indicator */}
              <div className="sticky top-0 z-10 px-8 py-6 border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Poppins' }}>Add new content block</span>
                  {!isTaskCompleted && (
                    <button
                      onClick={handleSubmitForXP}
                      className="px-6 py-2 bg-gradient-primary text-white rounded-lg font-bold hover:shadow-lg transition-all flex items-center gap-2"
                      style={{ fontFamily: 'Poppins' }}
                    >
                      <TrophyIcon className="w-4 h-4" />
                      Submit for XP
                    </button>
                  )}
                  {isTaskCompleted && (
                    <div className="px-6 py-2 bg-green-50 border-2 border-green-200 rounded-lg flex items-center gap-2">
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
              <div className="px-8 py-6 space-y-6">
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
        </ModalErrorBoundary>
      </div>
    </div>
  );
};

export default TaskEvidenceModal;
