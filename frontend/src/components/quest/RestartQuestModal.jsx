import React from 'react';
import { SparklesIcon, XMarkIcon } from '@heroicons/react/24/outline';

const RestartQuestModal = ({ isOpen, questTitle, previousTaskCount, onLoadPreviousTasks, onStartFresh, onClose }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white hover:bg-white/20 rounded-full p-1 transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 mb-2">
            <RotateCcw className="w-8 h-8" />
            <h2 className="text-2xl font-bold" style={{ fontFamily: 'Poppins' }}>
              Restart Quest
            </h2>
          </div>
          <p className="text-white/90" style={{ fontFamily: 'Poppins' }}>
            {questTitle}
          </p>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="mb-6">
            <div className="bg-blue-50 border-2 border-blue-200 rounded-lg p-4 mb-4">
              <div className="flex items-start gap-3">
                <div className="bg-blue-500 text-white rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 font-bold">
                  {previousTaskCount}
                </div>
                <div>
                  <p className="font-semibold text-gray-900 mb-1" style={{ fontFamily: 'Poppins' }}>
                    You have completed this quest before
                  </p>
                  <p className="text-sm text-gray-700" style={{ fontFamily: 'Poppins' }}>
                    You had {previousTaskCount} task{previousTaskCount !== 1 ? 's' : ''} in your previous attempt.
                  </p>
                </div>
              </div>
            </div>

            <p className="text-gray-700 mb-4" style={{ fontFamily: 'Poppins' }}>
              How would you like to restart this quest?
            </p>
          </div>

          {/* Options */}
          <div className="space-y-3">
            {/* Load Previous Tasks Option */}
            <button
              onClick={onLoadPreviousTasks}
              className="w-full bg-gradient-to-r from-optio-purple to-optio-pink text-white p-4 rounded-lg hover:shadow-lg transition-all duration-300 text-left group"
            >
              <div className="flex items-start gap-3">
                <RotateCcw className="w-6 h-6 flex-shrink-0 group-hover:rotate-180 transition-transform duration-500" />
                <div>
                  <div className="font-bold mb-1" style={{ fontFamily: 'Poppins' }}>
                    Load Previous Tasks
                  </div>
                  <div className="text-sm text-white/90" style={{ fontFamily: 'Poppins' }}>
                    Continue with the same {previousTaskCount} task{previousTaskCount !== 1 ? 's' : ''} you had before. You will start fresh on all tasks.
                  </div>
                </div>
              </div>
            </button>

            {/* Start Fresh Option */}
            <button
              onClick={onStartFresh}
              className="w-full bg-white border-2 border-gray-300 text-gray-900 p-4 rounded-lg hover:border-optio-purple hover:bg-purple-50 transition-all duration-300 text-left group"
            >
              <div className="flex items-start gap-3">
                <SparklesIcon className="w-6 h-6 flex-shrink-0 text-optio-purple group-hover:scale-110 transition-transform" />
                <div>
                  <div className="font-bold mb-1" style={{ fontFamily: 'Poppins' }}>
                    Start Fresh
                  </div>
                  <div className="text-sm text-gray-600" style={{ fontFamily: 'Poppins' }}>
                    Begin with a clean slate. You will choose new tasks during personalization.
                  </div>
                </div>
              </div>
            </button>
          </div>

          {/* Cancel Button */}
          <button
            onClick={onClose}
            className="w-full mt-4 text-gray-600 hover:text-gray-900 py-2 text-center font-medium transition-colors"
            style={{ fontFamily: 'Poppins' }}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default RestartQuestModal;
