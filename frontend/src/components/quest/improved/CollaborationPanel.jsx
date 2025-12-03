import React, { useState } from 'react';
import Button from '../../ui/Button';

const CollaborationPanel = ({ 
  quest, 
  collaboration, 
  onInvite, 
  onAccept, 
  onDecline,
  currentUserId 
}) => {
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [isInviting, setIsInviting] = useState(false);

  const handleInvite = async () => {
    if (!inviteEmail) return;
    
    setIsInviting(true);
    try {
      await onInvite(inviteEmail);
      setInviteEmail('');
      setShowInviteForm(false);
    } finally {
      setIsInviting(false);
    }
  };

  // Different states for collaboration
  const hasCollaboration = collaboration && collaboration.status;
  const isPending = collaboration?.status === 'pending';
  const isAccepted = collaboration?.status === 'accepted';
  const isRequester = collaboration?.requester_id === currentUserId;

  if (!hasCollaboration && !quest.user_enrollment) {
    // Not enrolled yet - show team up benefits
    return (
      <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white text-xl flex-shrink-0">
            👥
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Team Up for Double XP!</h3>
            <p className="text-sm text-gray-600 mb-4">
              Collaborate with a friend on this quest and both earn 2x XP on eligible tasks. 
              Learning is better together!
            </p>
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1 text-optio-purple">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Mutual accountability</span>
              </div>
              <div className="flex items-center gap-1 text-optio-purple">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Shared learning</span>
              </div>
              <div className="flex items-center gap-1 text-optio-purple">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>2x XP rewards</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isAccepted) {
    // Active collaboration
    const partnerNames = collaboration.collaborator_names || [];
    
    return (
      <div className="bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl p-6 border border-green-300">
        <div className="flex items-start gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full bg-gradient-to-r from-green-500 to-emerald-500 flex items-center justify-center text-white text-xl">
              ✓
            </div>
            <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-purple-500 text-white text-xs flex items-center justify-center font-bold">
              2x
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-green-700 mb-2">Team-Up Active!</h3>
            <div className="mb-3">
              <p className="text-sm text-gray-700">
                You're collaborating with <span className="font-semibold">{partnerNames.join(' & ')}</span>
              </p>
              <p className="text-xs text-gray-600 mt-1">
                All eligible tasks now earn double XP for both team members!
              </p>
            </div>
            
            {/* Collaboration Stats */}
            <div className="grid grid-cols-3 gap-3 p-3 bg-white/70 rounded-lg">
              <div className="text-center">
                <div className="text-lg font-bold text-green-600">2x</div>
                <div className="text-xs text-gray-600">XP Multiplier</div>
              </div>
              <div className="text-center border-x border-gray-200">
                <div className="text-lg font-bold text-optio-purple">{partnerNames.length + 1}</div>
                <div className="text-xs text-gray-600">Team Size</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-blue-600">∞</div>
                <div className="text-xs text-gray-600">Motivation</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (isPending) {
    // Pending invitation
    return (
      <div className="bg-gradient-to-r from-yellow-50 to-orange-50 rounded-xl p-6 border border-yellow-300">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-full bg-gradient-to-r from-yellow-500 to-orange-500 flex items-center justify-center text-white animate-pulse">
            ⏳
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Team-Up Invitation Pending</h3>
            {isRequester ? (
              <div>
                <p className="text-sm text-gray-600 mb-3">
                  Waiting for your friend to accept the invitation...
                </p>
                <p className="text-xs text-gray-500">
                  They'll receive an email notification. Once accepted, you'll both earn 2x XP!
                </p>
              </div>
            ) : (
              <div>
                <p className="text-sm text-gray-600 mb-4">
                  <span className="font-semibold">{collaboration.requester_name}</span> wants to team up with you!
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="success"
                    size="sm"
                    onClick={onAccept}
                  >
                    Accept & Start Earning 2x XP
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onDecline}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // No collaboration - show invite form
  return (
    <div className="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-6 border border-purple-200">
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center text-white text-xl flex-shrink-0">
          👥
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Want to Team Up?</h3>
          
          {!showInviteForm ? (
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Invite a friend to collaborate and both earn double XP on this quest!
              </p>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowInviteForm(true)}
              >
                Invite a Friend
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                Enter your friend's email to send them an invitation:
              </p>
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="friend@example.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500"
                  onKeyPress={(e) => e.key === 'Enter' && handleInvite()}
                />
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleInvite}
                  loading={isInviting}
                  disabled={!inviteEmail}
                >
                  Send
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setShowInviteForm(false);
                    setInviteEmail('');
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CollaborationPanel;