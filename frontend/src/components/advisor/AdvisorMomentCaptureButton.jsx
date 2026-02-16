import { useState } from 'react';
import PropTypes from 'prop-types';
import { PlusIcon } from '@heroicons/react/24/outline';
import AdvisorMomentCaptureModal from './AdvisorMomentCaptureModal';

const OPTIO_LOGO_URL = 'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg';

/**
 * Floating action button for advisors to capture learning moments.
 * Simplified version of ParentMomentCaptureButton - no child selector needed.
 */
const AdvisorMomentCaptureButton = ({ studentId, studentName, onSuccess = null }) => {
  const [showModal, setShowModal] = useState(false);

  const handleSuccess = (moment) => {
    setShowModal(false);
    if (onSuccess) onSuccess(moment);
  };

  return (
    <>
      <button
        onClick={() => setShowModal(true)}
        className="fixed bottom-6 right-6 z-40 group"
        title="Capture Learning Moment"
        aria-label="Capture a learning moment"
      >
        <div className="flex items-center gap-2 px-4 py-3 rounded-full shadow-lg bg-white border-2 border-optio-purple text-optio-purple font-semibold transform transition-all duration-300 ease-out hover:shadow-xl hover:scale-105 group-hover:pr-6">
          <img src={OPTIO_LOGO_URL} alt="" className="w-5 h-5" />
          <span className="overflow-hidden transition-all duration-300 ease-out whitespace-nowrap max-w-0 opacity-0 group-hover:max-w-40 group-hover:opacity-100">
            Capture Moment
          </span>
          <PlusIcon className="w-5 h-5 transition-transform duration-300 group-hover:rotate-90" />
        </div>
      </button>

      <AdvisorMomentCaptureModal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        studentId={studentId}
        studentName={studentName}
        onSuccess={handleSuccess}
      />
    </>
  );
};

AdvisorMomentCaptureButton.propTypes = {
  studentId: PropTypes.string.isRequired,
  studentName: PropTypes.string.isRequired,
  onSuccess: PropTypes.func,
};

export default AdvisorMomentCaptureButton;
