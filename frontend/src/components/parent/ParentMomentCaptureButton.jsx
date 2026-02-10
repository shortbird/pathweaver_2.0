import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { PlusIcon } from '@heroicons/react/24/outline';
import ParentMomentCaptureModal from './ParentMomentCaptureModal';

const OPTIO_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg';

/**
 * Floating action button for capturing learning moments.
 * Positioned at bottom-right of the parent dashboard.
 * Only shown when parent has at least one child.
 * Matches the QuickCaptureButton styling from the student dashboard.
 */
const ParentMomentCaptureButton = ({
  children = [],
  dependents = [],
  selectedChildId = null,
  onSuccess = null
}) => {
  const [showModal, setShowModal] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isWiggling, setIsWiggling] = useState(false);

  // Random wiggle every 2-10 seconds
  useEffect(() => {
    const scheduleWiggle = () => {
      const delay = 2000 + Math.random() * 8000; // 2-10 seconds
      return setTimeout(() => {
        setIsWiggling(true);
        setTimeout(() => setIsWiggling(false), 500); // Wiggle duration
        scheduleWiggle();
      }, delay);
    };

    const timeoutId = scheduleWiggle();
    return () => clearTimeout(timeoutId);
  }, []);

  // Combine children and dependents into a single list
  const allChildren = [
    ...(children || []).map(c => ({
      id: c.student_id,
      name: `${c.student_first_name} ${c.student_last_name || ''}`.trim(),
      isDependent: false
    })),
    ...(dependents || []).map(d => ({
      id: d.id,
      name: d.display_name,
      isDependent: true
    }))
  ];

  // Don't render if no children
  if (allChildren.length === 0) {
    return null;
  }

  const handleSuccess = (moment) => {
    setShowModal(false);
    if (onSuccess) {
      onSuccess(moment);
    }
  };

  return (
    <>
      {/* Floating Action Button */}
      <button
        onClick={() => setShowModal(true)}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="fixed bottom-6 right-6 z-40 group"
        title="Capture Learning Moment"
        aria-label="Capture a learning moment"
      >
        <div className="relative">
          {/* Main button */}
          <div
            className={`
              flex items-center gap-2 px-4 py-3 rounded-full shadow-lg
              bg-white border-2 border-optio-purple
              text-optio-purple font-semibold
              transform transition-all duration-300 ease-out
              hover:shadow-xl hover:scale-105
              ${isHovered ? 'pr-6' : ''}
              ${isWiggling ? 'animate-wiggle' : ''}
            `}
            style={isWiggling ? {
              animation: 'wiggle 0.5s ease-in-out'
            } : {}}
          >
            <img src={OPTIO_LOGO_URL} alt="" className="w-5 h-5" />
            <span className={`
              overflow-hidden transition-all duration-300 ease-out whitespace-nowrap
              ${isHovered ? 'max-w-40 opacity-100' : 'max-w-0 opacity-0'}
            `}>
              Capture Moment
            </span>
            <PlusIcon className={`
              w-5 h-5 transition-transform duration-300
              ${isHovered ? 'rotate-90' : ''}
            `} />
          </div>
        </div>
      </button>

      {/* Wiggle animation keyframes */}
      <style>{`
        @keyframes wiggle {
          0%, 100% { transform: rotate(0deg); }
          20% { transform: rotate(-8deg); }
          40% { transform: rotate(8deg); }
          60% { transform: rotate(-5deg); }
          80% { transform: rotate(5deg); }
        }
      `}</style>

      {/* Capture Modal */}
      <ParentMomentCaptureModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        children={allChildren}
        selectedChildId={selectedChildId}
        onSuccess={handleSuccess}
      />
    </>
  );
};

ParentMomentCaptureButton.propTypes = {
  children: PropTypes.arrayOf(PropTypes.shape({
    student_id: PropTypes.string.isRequired,
    student_first_name: PropTypes.string.isRequired,
    student_last_name: PropTypes.string
  })),
  dependents: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    display_name: PropTypes.string.isRequired
  })),
  selectedChildId: PropTypes.string,
  onSuccess: PropTypes.func
};

export default ParentMomentCaptureButton;
