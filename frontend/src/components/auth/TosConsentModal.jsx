import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import Button from '../ui/Button';
import { DocumentTextIcon, ShieldCheckIcon } from '@heroicons/react/24/outline';

/**
 * TosConsentModal - Terms of Service acceptance modal for Google OAuth users
 *
 * Shown when a new user signs in via Google OAuth for the first time.
 * Requires explicit acceptance of Terms of Service and Privacy Policy
 * before completing registration.
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Close handler (cancels sign-in)
 * @param {function} onAccept - Accept handler (user consents)
 * @param {boolean} loading - Whether the request is in progress
 * @param {string} userName - User's name from Google (optional)
 * @param {boolean} isObserverSignup - Whether this is an observer invitation signup
 */
const TosConsentModal = ({
  isOpen,
  onClose,
  onAccept,
  loading = false,
  userName = '',
  isObserverSignup = false
}) => {
  const [tosChecked, setTosChecked] = useState(false);
  const [privacyChecked, setPrivacyChecked] = useState(false);

  const canAccept = tosChecked && privacyChecked;

  const handleAccept = () => {
    if (canAccept) {
      onAccept();
    }
  };

  const handleClose = () => {
    setTosChecked(false);
    setPrivacyChecked(false);
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={userName ? `Welcome, ${userName}!` : 'Welcome to Optio'}
      size="md"
      closeOnOverlayClick={false}
      showCloseButton={false}
      footer={
        <div className="flex flex-col-reverse sm:flex-row gap-3 w-full">
          <Button
            variant="secondary"
            onClick={handleClose}
            disabled={loading}
            className="w-full sm:w-auto"
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleAccept}
            disabled={!canAccept || loading}
            loading={loading}
            className="w-full sm:w-auto"
          >
            Accept & Continue
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Introduction */}
        <div className="text-gray-600">
          <p>
            {isObserverSignup
              ? "Before you can start following a student's learning journey, please review and accept our Terms of Service and Privacy Policy."
              : 'Before you can start your learning journey, please review and accept our Terms of Service and Privacy Policy.'
            }
          </p>
        </div>

        {/* What Optio does */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <div className="flex gap-3">
            <ShieldCheckIcon className="h-6 w-6 text-optio-purple flex-shrink-0" />
            <div>
              <h4 className="font-medium text-gray-900">Your Privacy Matters</h4>
              <p className="text-gray-600 text-sm mt-1">
                {isObserverSignup
                  ? "As an observer, you'll be able to view and encourage a student's progress. Your data is protected and student privacy is our priority."
                  : 'Optio is designed to help you track your educational journey. Your data is protected and you control what you share.'
                }
              </p>
            </div>
          </div>
        </div>

        {/* Terms checkboxes */}
        <div className="space-y-4 border-t border-gray-200 pt-4">
          {/* Terms of Service */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                checked={tosChecked}
                onChange={(e) => setTosChecked(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-optio-purple
                         focus:ring-optio-purple focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <div className="flex-1">
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                I have read and agree to the{' '}
                <a
                  href="/terms"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-optio-purple hover:underline font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  Terms of Service
                </a>
              </span>
            </div>
          </label>

          {/* Privacy Policy */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                checked={privacyChecked}
                onChange={(e) => setPrivacyChecked(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-optio-purple
                         focus:ring-optio-purple focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <div className="flex-1">
              <span className="text-sm text-gray-700 group-hover:text-gray-900">
                I have read and agree to the{' '}
                <a
                  href="/privacy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-optio-purple hover:underline font-medium"
                  onClick={(e) => e.stopPropagation()}
                >
                  Privacy Policy
                </a>
              </span>
            </div>
          </label>
        </div>

        {/* Document links */}
        <div className="flex flex-wrap gap-4 text-sm">
          <a
            href="/terms"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-500 hover:text-optio-purple transition-colors"
          >
            <DocumentTextIcon className="h-4 w-4" />
            View Terms of Service
          </a>
          <a
            href="/privacy"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 text-gray-500 hover:text-optio-purple transition-colors"
          >
            <DocumentTextIcon className="h-4 w-4" />
            View Privacy Policy
          </a>
        </div>
      </div>
    </Modal>
  );
};

export default TosConsentModal;
