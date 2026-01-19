import React, { useState } from 'react';
import {
  AcademicCapIcon,
  SparklesIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';
import GraduationModal from './GraduationModal';

const GraduationPrompt = ({
  trackId,
  trackName,
  momentCount,
  momentIds = null,
  className = '',
  variant = 'banner', // 'banner' | 'card' | 'inline'
  onGraduationComplete
}) => {
  const [showModal, setShowModal] = useState(false);

  // Only show if enough moments
  const isEligible = momentCount >= 5;

  if (!isEligible) {
    return null;
  }

  const handleSuccess = (quest) => {
    setShowModal(false);
    onGraduationComplete?.(quest);
  };

  if (variant === 'inline') {
    return (
      <>
        <button
          onClick={() => setShowModal(true)}
          className={`
            inline-flex items-center gap-2 px-4 py-2
            bg-gradient-to-r from-amber-500 to-orange-500 text-white
            rounded-lg hover:shadow-md transition-all text-sm font-medium
            ${className}
          `}
        >
          <AcademicCapIcon className="w-4 h-4" />
          Graduate to Quest
        </button>

        <GraduationModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
          trackId={trackId}
          momentIds={momentIds}
          trackName={trackName}
        />
      </>
    );
  }

  if (variant === 'card') {
    return (
      <>
        <div
          className={`
            p-4 bg-gradient-to-r from-amber-50 to-orange-50
            border-2 border-amber-200 rounded-xl
            hover:border-amber-300 hover:shadow-md
            transition-all cursor-pointer
            ${className}
          `}
          onClick={() => setShowModal(true)}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-400 to-orange-400 rounded-xl flex items-center justify-center flex-shrink-0">
              <AcademicCapIcon className="w-6 h-6 text-white" />
            </div>

            <div className="flex-1">
              <h4 className="font-semibold text-amber-900">Ready for Graduation!</h4>
              <p className="text-sm text-amber-700">
                {momentCount} moments - convert to a Quest and earn XP
              </p>
            </div>

            <ArrowRightIcon className="w-5 h-5 text-amber-500" />
          </div>
        </div>

        <GraduationModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSuccess={handleSuccess}
          trackId={trackId}
          momentIds={momentIds}
          trackName={trackName}
        />
      </>
    );
  }

  // Default: banner variant
  return (
    <>
      <div
        className={`
          p-4 bg-gradient-to-r from-amber-100 via-orange-100 to-amber-100
          border border-amber-200 rounded-xl
          ${className}
        `}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-400 to-orange-400 rounded-lg flex items-center justify-center flex-shrink-0">
              <AcademicCapIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-amber-900">
                  Ready to Graduate?
                </h4>
                <SparklesIcon className="w-4 h-4 text-amber-500" />
              </div>
              <p className="text-sm text-amber-700">
                Convert {momentCount} learning moments into a formal Quest and earn XP
              </p>
            </div>
          </div>

          <button
            onClick={() => setShowModal(true)}
            className="
              flex items-center justify-center gap-2 px-4 py-2.5
              bg-gradient-to-r from-amber-500 to-orange-500 text-white
              rounded-lg hover:shadow-lg transition-all font-medium
              whitespace-nowrap
            "
          >
            <AcademicCapIcon className="w-5 h-5" />
            Graduate to Quest
          </button>
        </div>

        <p className="text-xs text-amber-600 mt-3">
          Retroactive learning earns 80% XP. Future moments captured in real-time earn full XP.
        </p>
      </div>

      <GraduationModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onSuccess={handleSuccess}
        trackId={trackId}
        momentIds={momentIds}
        trackName={trackName}
      />
    </>
  );
};

export default GraduationPrompt;
