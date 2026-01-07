import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Alert, FormFooter } from '../ui';
import { observerAPI } from '../../services/api';
import {
  ClipboardDocumentIcon,
  CheckIcon,
  LinkIcon,
  UserGroupIcon
} from '@heroicons/react/24/outline';

const InviteObserverModal = ({ isOpen, onClose, studentId, studentName, onSuccess }) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [observers, setObservers] = useState([]);
  const [loading, setLoading] = useState(false);

  // Load existing observers when modal opens
  useEffect(() => {
    if (isOpen && studentId) {
      loadObservers();
    }
  }, [isOpen, studentId]);

  const loadObservers = async () => {
    setLoading(true);
    try {
      const response = await observerAPI.getObserversForStudent(studentId);
      setObservers(response.data.observers || []);
    } catch (err) {
      console.error('Failed to load observers:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateLink = async () => {
    setError('');
    setIsSubmitting(true);

    try {
      const response = await observerAPI.parentCreateInvite(studentId, 'observer');
      setGeneratedLink({
        link: response.data.shareable_link,
        expiresAt: response.data.expires_at
      });
      if (onSuccess) {
        onSuccess({ message: 'Invitation link created!' });
      }
    } catch (err) {
      const errorMsg = err.response?.data?.message || err.response?.data?.error || 'Failed to create invitation link';
      setError(typeof errorMsg === 'string' ? errorMsg : 'Failed to create invitation link');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCopyLink = async () => {
    if (generatedLink?.link) {
      try {
        await navigator.clipboard.writeText(generatedLink.link);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } catch (err) {
        console.error('Failed to copy:', err);
      }
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setError('');
      setGeneratedLink(null);
      setCopied(false);
      onClose();
    }
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Invite Observers for ${studentName}`}
      size="md"
      showCloseButton={!isSubmitting}
    >
      <div className="space-y-6">
        {/* Explanation */}
        <Alert variant="info">
          <p>
            Share a link with family and friends so they can follow {studentName}'s learning journey.
            Observers can view completed work, leave encouraging comments, and celebrate achievements.
          </p>
        </Alert>

        {/* Generate Link Button */}
        {!generatedLink ? (
          <div className="space-y-4">
            {error && (
              <Alert variant="error">
                {error}
              </Alert>
            )}

            <button
              type="button"
              onClick={handleGenerateLink}
              disabled={isSubmitting}
              className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LinkIcon className="w-5 h-5 mr-2" />
              {isSubmitting ? 'Generating...' : 'Generate Invitation Link'}
            </button>
          </div>
        ) : (
          /* Generated Link Display */
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
            <p className="text-sm font-medium text-green-800">
              Link created! Share it with your invitee:
            </p>
            <div className="flex gap-2">
              <input
                type="text"
                value={generatedLink.link}
                readOnly
                className="flex-1 px-3 py-2 text-sm bg-white border border-green-300 rounded-md"
              />
              <button
                type="button"
                onClick={handleCopyLink}
                className="shrink-0 flex items-center px-3 py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
              >
                {copied ? (
                  <>
                    <CheckIcon className="w-4 h-4 mr-1" />
                    Copied
                  </>
                ) : (
                  <>
                    <ClipboardDocumentIcon className="w-4 h-4 mr-1" />
                    Copy
                  </>
                )}
              </button>
            </div>
            <p className="text-xs text-green-600">
              Expires {formatDate(generatedLink.expiresAt)}
            </p>
            <button
              type="button"
              onClick={() => setGeneratedLink(null)}
              className="text-sm text-green-700 hover:text-green-800 underline"
            >
              Generate a new link
            </button>
          </div>
        )}

        {/* Current Observers */}
        {observers.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <UserGroupIcon className="w-4 h-4" />
              Connected Observers ({observers.length})
            </h4>
            <div className="space-y-2">
              {observers.map(obs => (
                <div
                  key={obs.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="font-medium text-gray-900">
                      {obs.observer?.display_name ||
                        `${obs.observer?.first_name || ''} ${obs.observer?.last_name || ''}`.trim() ||
                        obs.observer?.email}
                    </p>
                  </div>
                  <span className="text-xs px-2 py-1 bg-green-100 text-green-700 rounded-full">
                    Connected
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-4 text-gray-500">
            Loading...
          </div>
        )}

        {/* Close Button */}
        <FormFooter
          onCancel={handleClose}
          cancelText="Close"
          showSubmit={false}
        />
      </div>
    </Modal>
  );
};

InviteObserverModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  studentId: PropTypes.string.isRequired,
  studentName: PropTypes.string.isRequired,
  onSuccess: PropTypes.func
};

export default InviteObserverModal;
