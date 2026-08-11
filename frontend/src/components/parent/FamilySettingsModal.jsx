import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Alert, Spinner } from '../ui';
import { observerAPI, parentAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  ClipboardDocumentIcon,
  CheckIcon,
  LinkIcon,
  UserGroupIcon,
  TrashIcon,
  UserPlusIcon,
  UserIcon,
  Cog6ToothIcon,
  PlusIcon,
  LockClosedIcon,
  ArrowUpCircleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import ChildPrivacyCard from './ChildPrivacyCard';

/**
 * FamilySettingsModal - Unified family management modal.
 * Combines: Children, Family Observers, and Parents/Guardians management.
 * Per-child settings (profile, login, AI features) live in the child's own
 * settings modal, reached from the Children tab -- not duplicated here.
 */
const FamilySettingsModal = ({
  isOpen,
  onClose,
  children = [],
  dependents = [],
  onAddChild,
  onChildSettingsClick,
  onRefresh
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('children');

  // Observers state
  const [observers, setObservers] = useState([]);
  const [loadingObservers, setLoadingObservers] = useState(false);
  const [selectedChildrenForInvite, setSelectedChildrenForInvite] = useState([]);
  const [generatedLink, setGeneratedLink] = useState(null);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [copied, setCopied] = useState(false);
  const [togglingAccess, setTogglingAccess] = useState({});

  // Parents state
  const [parents, setParents] = useState([]);
  const [loadingParents, setLoadingParents] = useState(false);
  const [promotingObserver, setPromotingObserver] = useState(null);

  // All children combined
  const allChildren = [
    ...dependents.map(d => ({
      id: d.id,
      name: d.display_name,
      avatar_url: d.avatar_url,
      type: 'dependent'
    })),
    ...children.map(c => ({
      id: c.student_id,
      name: `${c.student_first_name} ${c.student_last_name || ''}`.trim(),
      avatar_url: c.student_avatar_url,
      type: 'linked'
    }))
  ];

  // Load data when modal opens
  useEffect(() => {
    if (isOpen) {
      if (activeTab === 'observers') {
        loadObservers();
      } else if (activeTab === 'parents') {
        loadParents();
      }
    }
  }, [isOpen, activeTab]);

  // Default select all children for observer invites
  useEffect(() => {
    if (isOpen && allChildren.length > 0) {
      setSelectedChildrenForInvite(allChildren.map(c => c.id));
    }
  }, [isOpen, allChildren.length]);

  const loadObservers = async () => {
    setLoadingObservers(true);
    try {
      const response = await observerAPI.getFamilyObservers();
      setObservers(response.data.observers || []);
    } catch (err) {
      console.error('Failed to load observers:', err);
    } finally {
      setLoadingObservers(false);
    }
  };

  const loadParents = async () => {
    setLoadingParents(true);
    try {
      const [parentsResponse, observersResponse] = await Promise.all([
        parentAPI.getFamilyParents(),
        observerAPI.getFamilyObservers()
      ]);
      setParents(parentsResponse.data.parents || []);
      // Also refresh observers so the "Add Parent" list is current
      setObservers(observersResponse.data.observers || []);
    } catch (err) {
      console.error('Failed to load parents:', err);
    } finally {
      setLoadingParents(false);
    }
  };

  // Observer handlers
  const handleToggleChildForInvite = (childId) => {
    setSelectedChildrenForInvite(prev =>
      prev.includes(childId)
        ? prev.filter(id => id !== childId)
        : [...prev, childId]
    );
  };

  const handleGenerateObserverLink = async () => {
    if (selectedChildrenForInvite.length === 0) {
      toast.error('Please select at least one child');
      return;
    }

    setIsGeneratingLink(true);
    try {
      const response = await observerAPI.familyInvite(selectedChildrenForInvite);
      setGeneratedLink({
        link: response.data.shareable_link,
        expiresAt: response.data.expires_at,
        studentNames: response.data.student_names
      });
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to create invitation link');
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleCopyLink = async () => {
    if (generatedLink?.link) {
      await navigator.clipboard.writeText(generatedLink.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast.success('Link copied!');
    }
  };

  const handleToggleObserverChildAccess = async (observerId, studentId, currentlyEnabled) => {
    const key = `${observerId}-${studentId}`;
    setTogglingAccess(prev => ({ ...prev, [key]: true }));

    try {
      await observerAPI.toggleChildAccess(observerId, studentId, !currentlyEnabled);
      await loadObservers();
      toast.success(currentlyEnabled ? 'Access removed' : 'Access granted');
    } catch (err) {
      toast.error('Failed to update access');
    } finally {
      setTogglingAccess(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleRemoveObserver = async (observerId, observerName) => {
    if (!window.confirm(`Remove ${observerName}? They will no longer be able to view any of your children.`)) {
      return;
    }

    try {
      await observerAPI.removeFamilyObserver(observerId);
      setObservers(prev => prev.filter(obs => obs.observer_id !== observerId));
      toast.success(`${observerName} has been removed`);
    } catch (err) {
      toast.error('Failed to remove observer');
    }
  };

  // Parent handlers
  const handlePromoteObserver = async (observerId, observerName) => {
    if (!window.confirm(`Make ${observerName} a parent? They will have full access to manage your children's accounts.`)) {
      return;
    }

    setPromotingObserver(observerId);
    try {
      const response = await parentAPI.promoteObserver(observerId);
      toast.success(response.data.message || `${observerName} is now a parent`);
      // Reload both parents and observers lists
      await loadParents();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to add parent');
    } finally {
      setPromotingObserver(null);
    }
  };

  const handleClose = () => {
    setGeneratedLink(null);
    onClose();
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric'
    });
  };

  const tabs = [
    { id: 'children', label: 'Children', icon: UserIcon, count: allChildren.length },
    { id: 'privacy', label: 'Privacy', icon: LockClosedIcon },
    { id: 'observers', label: 'Observers', icon: UserGroupIcon, count: observers.length },
    { id: 'parents', label: 'Parents', icon: UserPlusIcon, count: parents.length }
  ];

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Family Settings"
      size="lg"
    >
      <div className="min-h-[200px] sm:min-h-[400px]">
        {/* Tabs */}
        <div className="flex border-b border-gray-200 mb-4 sm:mb-6 overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2.5 sm:py-3 min-h-[44px] font-medium text-sm border-b-2 transition-colors whitespace-nowrap flex-shrink-0 ${
                activeTab === tab.id
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <tab.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.label.split(' ')[0]}</span>
              {tab.count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  activeTab === tab.id ? 'bg-optio-purple/10' : 'bg-gray-100'
                }`}>
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Children Tab */}
        {activeTab === 'children' && (
          <div className="space-y-4">
            {/* Children List */}
            {allChildren.length > 0 ? (
              <div className="space-y-2">
                {allChildren.map(child => (
                  <div
                    key={child.id}
                    className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      {child.avatar_url ? (
                        <img src={child.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white font-medium">
                          {(child.name || 'C').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">{child.name}</p>
                        <p className="text-xs text-gray-500">
                          {child.type === 'dependent' ? 'Under 13 (managed)' : 'Linked student'}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => onChildSettingsClick?.(child)}
                      className="p-2 text-gray-400 hover:text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors"
                      title="Child settings"
                    >
                      <Cog6ToothIcon className="w-5 h-5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <UserIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>No children added yet</p>
              </div>
            )}

            {/* One add-child door for both ages: the shared AddChildModal asks
                the birth date and decides dependent vs. own account, so no
                under-13-only form (or "email support" detour) lives here. */}
            <button
              onClick={onAddChild}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-optio-purple hover:text-optio-purple transition-colors"
            >
              <PlusIcon className="w-5 h-5" />
              Add Child
            </button>
          </div>
        )}

        {/* Privacy Tab: who can see each child's work, and the links that
            grant access. Lived on the dashboard itself until it proved too
            prominent for a setting most parents only need to check. */}
        {activeTab === 'privacy' && (
          <div className="space-y-3">
            {allChildren.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <LockClosedIcon className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>Add children first to manage portfolio privacy</p>
              </div>
            ) : (
              allChildren.map(child => (
                <ChildPrivacyCard
                  key={child.id}
                  studentId={child.id}
                  studentName={(child.name || '').split(' ')[0] || 'your child'}
                />
              ))
            )}
          </div>
        )}

        {/* Observers Tab */}
        {activeTab === 'observers' && (
          <div className="space-y-4">
            <Alert variant="info">
              Invite family members to view your children's learning progress and leave encouraging comments.
            </Alert>

            {/* Generate Link Section */}
            {!generatedLink ? (
              <div className="space-y-3">
                {allChildren.length > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <label className="text-sm font-medium text-gray-700">
                        Select children to share:
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          if (selectedChildrenForInvite.length === allChildren.length) {
                            setSelectedChildrenForInvite([]);
                          } else {
                            setSelectedChildrenForInvite(allChildren.map(c => c.id));
                          }
                        }}
                        className="text-sm text-optio-purple hover:underline"
                      >
                        {selectedChildrenForInvite.length === allChildren.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {allChildren.map(child => (
                        <button
                          key={child.id}
                          onClick={() => handleToggleChildForInvite(child.id)}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors ${
                            selectedChildrenForInvite.includes(child.id)
                              ? 'border-optio-purple bg-optio-purple/10 text-optio-purple'
                              : 'border-gray-200 text-gray-600 hover:border-gray-300'
                          }`}
                        >
                          <span className={`w-4 h-4 rounded border flex items-center justify-center ${
                            selectedChildrenForInvite.includes(child.id)
                              ? 'bg-optio-purple border-optio-purple'
                              : 'border-gray-300'
                          }`}>
                            {selectedChildrenForInvite.includes(child.id) && (
                              <CheckIcon className="w-3 h-3 text-white" />
                            )}
                          </span>
                          {child.name}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                <button
                  onClick={handleGenerateObserverLink}
                  disabled={isGeneratingLink || selectedChildrenForInvite.length === 0}
                  className="btn-primary w-full min-h-[44px]"
                >
                  <LinkIcon className="w-5 h-5" />
                  {isGeneratingLink ? 'Generating...' : 'Generate Invitation Link'}
                </button>
              </div>
            ) : (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
                <p className="text-sm font-medium text-green-800">
                  Share this link with your invitee:
                </p>
                {generatedLink.studentNames?.length > 0 && (
                  <p className="text-xs text-green-600">
                    Access to: {generatedLink.studentNames.join(', ')}
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
                    onClick={handleCopyLink}
                    className="btn-quiet"
                  >
                    {copied ? <CheckIcon className="w-4 h-4" /> : <ClipboardDocumentIcon className="w-4 h-4" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <p className="text-xs text-green-600">Expires {formatDate(generatedLink.expiresAt)}</p>
                <button
                  onClick={() => setGeneratedLink(null)}
                  className="text-sm text-green-700 hover:underline"
                >
                  Generate new link
                </button>
              </div>
            )}

            {/* Current Observers */}
            {loadingObservers ? (
              <div className="text-center py-4">
                <Spinner size="sm" className="mx-auto" />
              </div>
            ) : observers.length > 0 ? (
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-medium text-gray-700">Current Observers</h4>
                {observers.map(obs => (
                  <div key={obs.observer_id} className="p-3 bg-gray-50 rounded-lg space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {obs.avatar_url ? (
                          <img src={obs.avatar_url} alt="" className="w-8 h-8 rounded-full" />
                        ) : (
                          <div className="w-8 h-8 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white text-sm font-medium">
                            {(obs.observer_name || 'O').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{obs.observer_name || 'Observer'}</p>
                          <p className="text-xs text-gray-500 capitalize">{obs.relationship?.replace('_', ' ') || 'Family'}</p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveObserver(obs.observer_id, obs.observer_name)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Child access toggles */}
                    <div className="flex flex-wrap gap-1.5">
                      {obs.children?.map(child => {
                        const key = `${obs.observer_id}-${child.student_id}`;
                        return (
                          <button
                            key={child.student_id}
                            onClick={() => handleToggleObserverChildAccess(obs.observer_id, child.student_id, child.enabled)}
                            disabled={togglingAccess[key]}
                            className={`text-xs px-2 py-1 rounded-full transition-colors ${
                              child.enabled
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-500'
                            } ${togglingAccess[key] ? 'opacity-50' : 'hover:opacity-80'}`}
                          >
                            {togglingAccess[key] ? '...' : child.student_name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-6 text-gray-500 border-t">
                <UserGroupIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No observers yet</p>
              </div>
            )}
          </div>
        )}

        {/* Parents Tab */}
        {activeTab === 'parents' && (
          <div className="space-y-4">
            {/* Current Parents */}
            <div>
              <h4 className="text-sm font-medium text-gray-700 mb-2">Current Parents</h4>
              {loadingParents ? (
                <div className="text-center py-4">
                  <Spinner size="sm" className="mx-auto" />
                </div>
              ) : (
                <div className="space-y-2">
                  {/* You (current user) */}
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      {user?.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white font-medium">
                          {(user?.display_name || user?.first_name || user?.email || 'Y').charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-medium text-gray-900">
                          {user?.display_name || `${user?.first_name || ''} ${user?.last_name || ''}`.trim() || 'You'}
                        </p>
                        <p className="text-xs text-gray-500">Account owner</p>
                      </div>
                    </div>
                  </div>

                  {/* Other parents */}
                  {parents.map(parent => (
                    <div key={parent.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        {parent.avatar_url ? (
                          <img src={parent.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white font-medium">
                            {(parent.name || 'P').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{parent.name || parent.email}</p>
                          <p className="text-xs text-gray-500">Co-parent</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Add Parent from Observers */}
            {!loadingParents && (() => {
              const parentIds = new Set([user?.id, ...parents.map(p => p.id)].filter(Boolean));
              const promotableObservers = observers.filter(obs => !parentIds.has(obs.observer_id));
              return (
              <div className="border-t pt-4 space-y-3">
                <h4 className="text-sm font-medium text-gray-700">Add Parent</h4>

                {promotableObservers.length > 0 ? (
                  <div className="space-y-2">
                    {promotableObservers.map(obs => (
                      <div key={obs.observer_id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          {obs.avatar_url ? (
                            <img src={obs.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover" />
                          ) : (
                            <div className="w-8 h-8 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white text-sm font-medium">
                              {(obs.observer_name || 'O').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <p className="font-medium text-gray-900 text-sm">{obs.observer_name || 'Observer'}</p>
                        </div>
                        <button
                          onClick={() => handlePromoteObserver(obs.observer_id, obs.observer_name || 'this observer')}
                          disabled={promotingObserver === obs.observer_id}
                          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[44px] text-sm font-medium text-optio-purple bg-optio-purple/10 rounded-lg hover:bg-optio-purple/20 disabled:opacity-50 transition-colors"
                        >
                          <ArrowUpCircleIcon className="w-4 h-4" />
                          {promotingObserver === obs.observer_id ? 'Adding...' : 'Make Parent'}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-4 text-gray-500">
                    <UserGroupIcon className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No observers to add as parent</p>
                  </div>
                )}

                <p className="text-sm text-gray-500 bg-gray-50 p-3 rounded-lg">
                  To add another parent, first invite them as an observer in the Observers tab. You will then be able to add them as a parent here.
                </p>
              </div>
              );
            })()}
          </div>
        )}
      </div>
    </Modal>
  );
};

FamilySettingsModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  children: PropTypes.array,
  dependents: PropTypes.array,
  onAddChild: PropTypes.func,
  onChildSettingsClick: PropTypes.func,
  onRefresh: PropTypes.func
};

export default FamilySettingsModal;
