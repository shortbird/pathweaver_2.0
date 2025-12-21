import PropTypes from 'prop-types';
import { XMarkIcon, EnvelopeIcon } from '@heroicons/react/24/outline';

const RequestStudentConnectionModal = ({ isOpen, onClose }) => {
  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between bg-gradient-to-r from-optio-purple to-optio-pink">
          <h2 className="text-xl font-semibold text-white font-['Poppins']">
            Connect to Existing Student
          </h2>
          <button
            onClick={onClose}
            className="text-white hover:text-gray-200 transition-colors"
          >
            <XMarkIcon className="w-6 h-6" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Email Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full flex items-center justify-center">
              <EnvelopeIcon className="w-8 h-8 text-white" />
            </div>
          </div>

          {/* Instructions */}
          <div className="text-center space-y-3">
            <h3 className="text-lg font-semibold text-gray-900 font-['Poppins']">
              Contact Optio Support
            </h3>
            <p className="text-gray-700 font-medium font-['Poppins']">
              To connect to an existing student account (ages 13+), please email our support team with the following information:
            </p>
          </div>

          {/* What to Include */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h4 className="text-sm font-semibold text-gray-900 mb-2 font-['Poppins']">
              Include in your email:
            </h4>
            <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside font-['Poppins']">
              <li>Your full name (parent)</li>
              <li>Student's full name</li>
              <li>Student's email address (used to log in to Optio)</li>
            </ul>
          </div>

          {/* Support Email */}
          <div className="bg-blue-50 border-2 border-blue-300 rounded-lg p-4 text-center">
            <p className="text-sm text-blue-900 font-medium mb-2 font-['Poppins']">
              Send to:
            </p>
            <a
              href="mailto:support@optioeducation.com?subject=Parent Connection Request"
              className="text-lg font-bold text-blue-600 hover:text-blue-700 underline font-['Poppins']"
            >
              support@optioeducation.com
            </a>
          </div>

          {/* Note */}
          <div className="text-xs text-gray-600 bg-purple-50 border border-purple-200 rounded-lg p-3 font-['Poppins']">
            <strong>Note:</strong> Once connected, you can view their progress and upload evidence. However, the student maintains control and must mark tasks as complete themselves.
          </div>

          {/* Close Button */}
          <div className="pt-4">
            <button
              onClick={onClose}
              className="w-full px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:shadow-lg transition-shadow font-semibold font-['Poppins']"
            >
              Got It
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

RequestStudentConnectionModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired
};

export default RequestStudentConnectionModal;