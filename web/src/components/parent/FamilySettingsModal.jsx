import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Alert, Spinner } from '../ui';
import api, { observerAPI, parentAPI } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import {
  ClipboardDocumentIcon,
  CheckIcon,
  LinkIcon,
  UserGroupIcon,
  TrashIcon,
  UserIcon,
  PlusIcon,
  ArrowUpCircleIcon
} from '@heroicons/react/24/outline';
import toast from 'react-hot-toast';
import GlassTabBar from '../ui/GlassTabBar';
import ChildSettingsPanel from './ChildSettingsPanel';
import { useConfirm } from '../../contexts/ConfirmContext'

/**
 * FamilySettingsModal - the ONE settings surface for a family.
 *
 * Tabs: You, then one tab per child, then Observers and Parents. A child's
 * tab is ChildSettingsPanel (profile, login, AI features, privacy) rendered
 * in place.
 *
 * Until 2026-09-15 there were two modals: this one with You / Children /
 * Privacy / Observers / Parents, and a second (DependentSettingsModal) with
 * Profile / Login / AI / Observers that the Children tab opened per child,
 * closing this one to do it. Privacy here was one card per child, Observers
 * appeared in both. Nine tabs across two modals to change a child's name.
 * The child tabs replace the Children list and the Privacy tab; the second
 * modal's Observers tab is dropped because the family Observers tab already
 * has a per-child access switch on every observer.
 *
 * The "You" tab exists because a parent had nowhere else: /overview is the
 * student portfolio and is blocked for parents, and the account menu sends them
 * here to the Family Dashboard instead. So a parent whose own name was entered
 * wrong at enrolment could not fix it anywhere in the product (2026-08-25).
 *
 * `family` is the list hooks/api/useFamilyChildren returns (one shape for
 * both kinds of child); `initialTab` may be 'you', 'observers', 'parents'
 * or a child's id, and `initialSection` names the row of a child's tab to
 * open on arrival ('friends' for every Friends notification).
 */
const FamilySettingsModal = ({
  isOpen,
  onClose,
  family = [],
  onAddChild,
  onRefresh,
  initialTab = 'you',
  initialSection = null,
}) => {
  const confirm = useConfirm()
  const { user, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);

  // Your own name.
  const [myFirstName, setMyFirstName] = useState('');
  const [myLastName, setMyLastName] = useState('');
  const [savingMyName, setSavingMyName] = useState(false);

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

  // The observer tab's child list, in the shape it has always read.
  const allChildren = family.map((c) => ({
    id: c.id,
    name: c.name,
    avatar_url: c.avatarUrl,
    type: c.isDependent ? 'dependent' : 'linked',
  }));

  // Honour the caller's tab each time the modal opens (the account menu deep
  // links to 'you'), without stranding the user there if they switch tabs.
  useEffect(() => {
    if (isOpen) setActiveTab(initialTab);
  }, [isOpen, initialTab]);

  // Seed your own name from the signed-in user each time the modal opens, so a
  // half-typed correction never survives a close.
  useEffect(() => {
    if (!isOpen) return;
    setMyFirstName(user?.first_name || '');
    setMyLastName(user?.last_name || '');
  }, [isOpen, user?.first_name, user?.last_name]);

  const handleSaveMyName = async () => {
    if (!myFirstName.trim() || !myLastName.trim()) {
      toast.error('First and last name are both required');
      return;
    }
    setSavingMyName(true);
    try {
      // display_name is derived server-side from first + last, so it can never
      // disagree with the two fields shown here.
      await api.put('/api/users/profile', {
        first_name: myFirstName.trim(),
        last_name: myLastName.trim(),
      });
      await refreshUser?.();
      toast.success('Your name has been updated');
      onRefresh?.();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update your name');
    } finally {
      setSavingMyName(false);
    }
  };

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
    if (!(await confirm(`Remove ${observerName}? They will no longer be able to view any of your children.`))) {
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
    if (!(await confirm(`Make ${observerName} a parent? They will have full access to manage your children's accounts.`))) {
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

  const childTab = (c) => ({
    id: c.id,
    label: (
      <span className="inline-flex items-center gap-1.5">
        {c.avatarUrl ? (
          <img src={c.avatarUrl} alt="" className="w-4 h-4 rounded-full object-cover" />
        ) : (
          <UserIcon className="w-3.5 h-3.5" />
        )}
        {c.firstName}
      </span>
    ),
  });
  const tabs = [
    { id: 'you', label: 'You' },
    ...family.map(childTab),
    { id: 'observers', label: 'Observers', badge: observers.length || undefined },
    { id: 'parents', label: 'Parents', badge: parents.length || undefined },
  ];
  const activeChild = family.find((c) => c.id === activeTab) || null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Family Settings"
      size="lg"
      maxWidthClassName="max-w-3xl"
    >
      <div className="min-h-[200px] sm:min-h-[320px]">
        <div className="mb-5 space-y-2">
          {/* The rail spans the panel: it is the modal's navigation, not a
              filter on a page. */}
          <GlassTabBar tabs={tabs} active={activeTab} onSelect={setActiveTab} aria-label="Family settings" size="lg" stretch />
          {/* One add-child door for both ages: the shared AddChildModal asks
              the birth date and decides dependent vs. own account. Absent
              (onAddChild null) for a family in an SIS school, whose office
              owns the roster. */}
          {onAddChild && (
            <div className="flex justify-end">
              <button type="button" onClick={onAddChild} className="btn-ghost px-3 py-1.5 text-sm">
                <PlusIcon className="w-4 h-4" />
                Add a child
              </button>
            </div>
          )}
        </div>

        {/* Your own account. Name only — email and password changes go through
            their own flows, and a guardian's role is not theirs to edit. */}
        {activeTab === 'you' && (
          <div className="space-y-5">
            <div className="flex items-center gap-4">
              {user?.avatar_url ? (
                <img src={user.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover" />
              ) : (
                <div className="w-14 h-14 bg-gradient-to-br from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white text-lg font-medium">
                  {(myFirstName || user?.email || 'Y').charAt(0).toUpperCase()}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-lg font-semibold text-gray-900 truncate">
                  {`${myFirstName} ${myLastName}`.trim() || 'Your account'}
                </p>
                <p className="text-base text-gray-500 truncate">{user?.email}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="my-first-name" className="block text-base font-medium text-gray-700 mb-1">
                  First name
                </label>
                <input
                  id="my-first-name"
                  type="text"
                  value={myFirstName}
                  onChange={(e) => setMyFirstName(e.target.value)}
                  className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                  placeholder="First name"
                />
              </div>
              <div>
                <label htmlFor="my-last-name" className="block text-base font-medium text-gray-700 mb-1">
                  Last name
                </label>
                <input
                  id="my-last-name"
                  type="text"
                  value={myLastName}
                  onChange={(e) => setMyLastName(e.target.value)}
                  className="w-full px-3 py-2.5 text-base border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-base text-gray-500">
                This is how your school and your children&apos;s teachers see you. If your
                names were entered the wrong way round, swap them here.
              </p>
              <button
                onClick={handleSaveMyName}
                disabled={savingMyName || !myFirstName.trim() || !myLastName.trim()}
                className="btn-primary flex-shrink-0"
              >
                {savingMyName ? 'Saving...' : 'Save name'}
              </button>
            </div>

            {family.length > 0 && (
              <p className="text-base text-gray-500 bg-gray-50 p-3 rounded-lg">
                To correct a child&apos;s name, open their tab above.
              </p>
            )}
          </div>
        )}

        {activeChild && (
          <ChildSettingsPanel
            key={activeChild.id}
            child={activeChild.raw}
            isDependent={activeChild.isDependent}
            onUpdate={onRefresh}
            initialSection={activeChild.id === initialTab ? initialSection : null}
          />
        )}

        {/* Observers Tab */}
        {activeTab === 'observers' && (
          <div className="space-y-4">
            <Alert variant="info">
              Invite family members to view your children's learning progress and leave encouraging comments.
              Each link works once, for one person, and expires after 7 days &mdash; make a separate link for
              everyone you want to invite.
            </Alert>

            {/* Generate Link Section */}
            {!generatedLink ? (
              <div className="space-y-3">
                {allChildren.length > 0 && (
                  <>
                    <div className="flex items-center justify-between">
                      <label className="text-base font-medium text-gray-700">
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
                  {isGeneratingLink ? 'Generating...' : 'Create a link for one person'}
                </button>
              </div>
            ) : (
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-3">
                <p className="text-base font-medium text-green-800">
                  Send this link to one person:
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
                <p className="text-xs text-green-600">
                  Works once, for whoever opens it first. Expires {formatDate(generatedLink.expiresAt)}.
                </p>
                <button
                  onClick={() => setGeneratedLink(null)}
                  className="text-sm text-green-700 hover:underline"
                >
                  Create another link for someone else
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
                <h4 className="text-base font-medium text-gray-900">Current Observers</h4>
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
                          <p className="font-medium text-gray-900">{obs.observer_name || 'Observer'}</p>
                          <p className="text-sm text-gray-500 capitalize">{obs.relationship?.replace('_', ' ') || 'Family'}</p>
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
                <p className="text-base">No observers yet</p>
              </div>
            )}
          </div>
        )}

        {/* Parents Tab */}
        {activeTab === 'parents' && (
          <div className="space-y-4">
            {/* Current Parents */}
            <div>
              <h4 className="text-base font-medium text-gray-900 mb-2">Current Parents</h4>
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
                        <p className="text-sm text-gray-500">Account owner</p>
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
                          <p className="text-sm text-gray-500">Co-parent</p>
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
                <h4 className="text-base font-medium text-gray-900">Add Parent</h4>

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
                          <p className="font-medium text-gray-900">{obs.observer_name || 'Observer'}</p>
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
                    <p className="text-base">No observers to add as parent</p>
                  </div>
                )}

                <p className="text-base text-gray-500 bg-gray-50 p-3 rounded-lg">
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
  family: PropTypes.array,
  onAddChild: PropTypes.func,
  onRefresh: PropTypes.func,
  initialTab: PropTypes.string,
  initialSection: PropTypes.string,
};

export default FamilySettingsModal;
