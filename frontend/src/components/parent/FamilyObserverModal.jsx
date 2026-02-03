import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Alert, FormFooter } from '../ui';
import { observerAPI } from '../../services/api';
import {
  ClipboardDocumentIcon,
  CheckIcon,
  LinkIcon,
  UserGroupIcon,
  TrashIcon,
  UserPlusIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';

const FamilyObserverModal = ({ isOpen, onClose, children = [], onSuccess }) => {
  const [selectedChildren, setSelectedChildren] = useState([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [generatedLink, setGeneratedLink] = useState(null);
  const [copied, setCopied] = useState(false);
  const [observers, setObservers] = useState([]);
  const [allChildren, setAllChildren] = useState([]);
  const [loading, setLoading] = useState(false);
  const [togglingAccess, setTogglingAccess] = useState({});
  const [deletingObserver, setDeletingObserver] = useState(null);

  // Load family observers when modal opens
  useEffect(() => {
    if (isOpen) {
      loadFamilyObservers();
      // Default select all children
      if (children.length > 0) {
        setSelectedChildren(children.map(c => c.id));
      }
    }
  }, [isOpen, children]);

  const loadFamilyObservers = async () => {
    setLoading(true);
    try {
      const response = await observerAPI.getFamilyObservers();
      setObservers(response.data.observers || []);
      setAllChildren(response.data.children || children);
    } catch (err) {
      console.error('Failed to load family observers:', err);
      // Fallback to provided children
      setAllChildren(children);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleChild = (childId) => {
    setSelectedChildren(prev => {
      if (prev.includes(childId)) {
        return prev.filter(id => id !== childId);
      } else {
        return [...prev, childId];
      }
    });
  };

  const handleSelectAll = () => {
    if (selectedChildren.length === allChildren.length) {
      setSelectedChildren([]);
    } else {
      setSelectedChildren(allChildren.map(c => c.id));
    }
  };

  const handleGenerateLink = async () => {
    if (selectedChildren.length === 0) {
      setError('Please select at least one child');
      return;
    }

    setError('');
    setIsSubmitting(true);

    try {
      const response = await observerAPI.familyInvite(selectedChildren);
      setGeneratedLink({
        link: response.data.shareable_link,
        expiresAt: response.data.expires_at,
        studentNames: response.data.student_names,
        studentCount: response.data.student_count
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

  const handleToggleChildAccess = async (observerId, studentId, currentlyEnabled) => {
    const key = `${observerId}-${studentId}`;
    setTogglingAccess(prev => ({ ...prev, [key]: true }));

    try {
      await observerAPI.toggleChildAccess(observerId, studentId, !currentlyEnabled);
      // Refresh observers list
      await loadFamilyObservers();
      toast.success(currentlyEnabled ? 'Access removed' : 'Access granted');
    } catch (err) {
      console.error('Failed to toggle child access:', err);
      toast.error('Failed to update access');
    } finally {
      setTogglingAccess(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleRemoveObserver = async (observerId, observerName) => {
    if (!window.confirm(`Remove ${observerName} from all children? They will no longer be able to view any of your children's progress.`)) {
      return;
    }

    setDeletingObserver(observerId);
    try {
      await observerAPI.removeFamilyObserver(observerId);
      setObservers(prev => prev.filter(obs => obs.observer_id !== observerId));
      toast.success(`${observerName} has been removed`);
    } catch (err) {
      console.error('Failed to remove observer:', err);
      toast.error('Failed to remove observer');
    } finally {
      setDeletingObserver(null);
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
      title="Family Observers"
      size="lg"
      showCloseButton={!isSubmitting}
    >
      <div className="space-y-6">
        {/* Explanation */}
        <Alert variant="info">
          <p>
            Share a link with family members so they can follow your children's learning journeys.
            Observers can view completed work, leave encouraging comments, and celebrate achievements.
          </p>
        </Alert>

        {/* Generate Link Section */}
        {!generatedLink ? (
          <div className="space-y-4">
            {error && (
              <Alert variant="error">
                {error}
              </Alert>
            )}

            {/* Child Selection */}
            {allChildren.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Select children to share:
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="text-sm text-optio-purple hover:text-optio-pink"
                  >
                    {selectedChildren.length === allChildren.length ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div className="space-y-2">
                  {allChildren.map(child => (
                    <label
                      key={child.id}
                      className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-optio-purple cursor-pointer transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedChildren.includes(child.id)}
                        onChange={() => handleToggleChild(child.id)}
                        className="w-5 h-5 text-optio-purple border-gray-300 rounded focus:ring-optio-purple"
                      />
                      <div className="flex items-center gap-2">
                        {child.avatar_url ? (
                          <img
                            src={child.avatar_url}
                            alt=""
                            className="w-8 h-8 rounded-full"
                          />
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {(child.name || 'C').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="font-medium text-gray-900">{child.name}</span>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateLink}
              disabled={isSubmitting || selectedChildren.length === 0}
              className="w-full flex items-center justify-center px-4 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LinkIcon className="w-5 h-5 mr-2" />
              {isSubmitting ? 'Generating...' : `Generate Invitation Link${selectedChildren.length > 0 ? ` for ${selectedChildren.length} child${selectedChildren.length > 1 ? 'ren' : ''}` : ''}`}
            </button>
          </div>
        ) : (
          /* Generated Link Display */
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
            <p className="text-sm font-medium text-green-800">
              Link created for {generatedLink.studentCount} child{generatedLink.studentCount > 1 ? 'ren' : ''}! Share it with your invitee:
            </p>
            {generatedLink.studentNames && generatedLink.studentNames.length > 0 && (
              <p className="text-xs text-green-600">
                Includes: {generatedLink.studentNames.join(', ')}
              </p>
            )}
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

        {/* Current Family Observers */}
        {observers.length > 0 && (
          <div className="space-y-3 border-t pt-4">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-2">
              <UserGroupIcon className="w-4 h-4" />
              Family Observers ({observers.length})
            </h4>
            <div className="space-y-4">
              {observers.map(obs => (
                <div
                  key={obs.observer_id}
                  className="p-4 bg-gray-50 rounded-lg space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      {obs.avatar_url ? (
                        <img src={obs.avatar_url} alt="" className="w-10 h-10 rounded-full" />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white font-medium">
                          {(obs.observer_name || 'O').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{obs.observer_name || 'Observer'}</p>
                        {obs.observer_email && obs.observer_name !== obs.observer_email && (
                          <p className="text-xs text-gray-500">{obs.observer_email}</p>
                        )}
                        <p className="text-xs text-gray-400 capitalize">{obs.relationship?.replace('_', ' ') || 'Other'}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => handleRemoveObserver(obs.observer_id, obs.observer_name || 'Observer')}
                      disabled={deletingObserver === obs.observer_id}
                      className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                      title="Remove observer"
                    >
                      {deletingObserver === obs.observer_id ? (
                        <div className="w-5 h-5 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
                      ) : (
                        <TrashIcon className="w-5 h-5" />
                      )}
                    </button>
                  </div>

                  {/* Child toggles */}
                  <div className="flex flex-wrap gap-2">
                    {obs.children?.map(child => {
                      const toggleKey = `${obs.observer_id}-${child.student_id}`;
                      const isToggling = togglingAccess[toggleKey];
                      return (
                        <button
                          key={child.student_id}
                          onClick={() => handleToggleChildAccess(obs.observer_id, child.student_id, child.enabled)}
                          disabled={isToggling}
                          className={`
                            flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium transition-all
                            ${child.enabled
                              ? 'bg-green-100 text-green-700 hover:bg-green-200'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            }
                            ${isToggling ? 'opacity-50' : ''}
                          `}
                        >
                          {isToggling ? (
                            <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <span className={`w-2 h-2 rounded-full ${child.enabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                          )}
                          {child.student_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && observers.length === 0 && (
          <div className="text-center py-6 text-gray-500">
            <UserPlusIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
            <p>No family observers yet</p>
            <p className="text-sm">Generate a link above to invite family members</p>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="text-center py-4 text-gray-500">
            <div className="w-8 h-8 border-4 border-gray-200 border-t-optio-purple rounded-full animate-spin mx-auto mb-2" />
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

FamilyObserverModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.string.isRequired,
    name: PropTypes.string,
    avatar_url: PropTypes.string
  })),
  onSuccess: PropTypes.func
};

export default FamilyObserverModal;
