import React, { useState } from 'react';
import { Modal } from '../ui/Modal';
import Button from '../ui/Button';
import { GlobeAltIcon, EyeIcon, ShieldCheckIcon, UserGroupIcon } from '@heroicons/react/24/outline';

/**
 * PublicConsentModal - FERPA-compliant consent modal for making portfolio public
 *
 * Shows when user first tries to make their portfolio public.
 * Explains what "public" means and requires explicit consent acknowledgment.
 * For minors (under 18), explains that parent approval is required.
 *
 * @param {boolean} isOpen - Controls modal visibility
 * @param {function} onClose - Close handler (cancels the action)
 * @param {function} onConfirm - Confirm handler (user consents)
 * @param {boolean} isMinor - Whether user is under 18 or is_dependent
 * @param {string} parentName - First name of linked parent (for minors)
 * @param {boolean} loading - Whether the request is in progress
 */
const PublicConsentModal = ({
  isOpen,
  onClose,
  onConfirm,
  isMinor = false,
  parentName = 'your parent or guardian',
  loading = false
}) => {
  const [consentChecked, setConsentChecked] = useState(false);

  const handleConfirm = () => {
    if (consentChecked) {
      onConfirm();
    }
  };

  const handleClose = () => {
    setConsentChecked(false);
    onClose();
  };

  // What will be visible when public
  const visibleItems = [
    { icon: EyeIcon, text: 'Your completed quests and achievements' },
    { icon: UserGroupIcon, text: 'Evidence of your learning (photos, videos, documents)' },
    { icon: GlobeAltIcon, text: 'Your profile name and skill progress' }
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Make Your Portfolio Public"
      size="md"
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
            onClick={handleConfirm}
            disabled={!consentChecked || loading}
            loading={loading}
            className="w-full sm:w-auto"
          >
            {isMinor ? 'Request Parent Approval' : 'Make Public'}
          </Button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Introduction */}
        <div className="text-gray-600">
          <p>
            Making your portfolio public allows anyone with the link to view your
            educational achievements. This includes search engines, which may index
            your public content.
          </p>
        </div>

        {/* What will be visible */}
        <div>
          <h4 className="font-medium text-gray-900 mb-3">
            The following will be publicly visible:
          </h4>
          <ul className="space-y-3">
            {visibleItems.map((item, index) => (
              <li key={index} className="flex items-start gap-3">
                <item.icon className="h-5 w-5 text-optio-purple mt-0.5 flex-shrink-0" />
                <span className="text-gray-700">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Minor notice */}
        {isMinor && (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex gap-3">
              <ShieldCheckIcon className="h-6 w-6 text-amber-600 flex-shrink-0" />
              <div>
                <h4 className="font-medium text-amber-800">
                  Parent/Guardian Approval Required
                </h4>
                <p className="text-amber-700 text-sm mt-1">
                  Because you are under 18, {parentName} will need to approve this request
                  before your portfolio becomes public. They will be notified of your request.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Privacy reminder */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
          <p className="text-sm text-gray-600">
            You can change your portfolio back to private at any time from your
            diploma page. Making it private will immediately hide it from public view.
          </p>
        </div>

        {/* Consent checkbox */}
        <div className="border-t border-gray-200 pt-4">
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center justify-center mt-0.5">
              <input
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
                className="h-5 w-5 rounded border-gray-300 text-optio-purple
                         focus:ring-optio-purple focus:ring-offset-0 cursor-pointer"
              />
            </div>
            <span className="text-sm text-gray-700 group-hover:text-gray-900">
              I understand that my educational records will be publicly accessible
              {isMinor
                ? ' once my parent or guardian approves this request.'
                : ' and I consent to making my portfolio public.'}
            </span>
          </label>
        </div>
      </div>
    </Modal>
  );
};

export default PublicConsentModal;
