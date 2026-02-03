import React from 'react';
import { Card, CardBody, CardFooter } from './ui/Card';

/**
 * InvitationCard - Display quest invitation with accept/decline options
 *
 * @param {Object} invitation - Invitation data
 * @param {Function} onAccept - Handler for accepting invitation
 * @param {Function} onDecline - Handler for declining invitation
 * @param {boolean} isLoading - Loading state for actions
 */
const InvitationCard = ({ invitation, onAccept, onDecline, isLoading }) => {
  const { quest, invited_by, invitation_message, created_at } = invitation;

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
  };

  return (
    <Card variant="outlined" className="hover:shadow-lg transition-shadow">
      <CardBody>
        <div className="flex items-start justify-between mb-3">
          <div className="flex-1">
            <h3 className="text-lg font-bold text-gray-900 mb-1">
              {quest?.title || 'Quest Invitation'}
            </h3>
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <span>Invited by</span>
              <span className="font-semibold text-optio-purple">
                {invited_by?.display_name || invited_by?.first_name || 'Advisor'}
              </span>
              <span>•</span>
              <span>{formatDate(created_at)}</span>
            </div>
          </div>
        </div>

        {quest?.description && (
          <p className="text-sm text-gray-700 mb-3 line-clamp-2">
            {quest.description}
          </p>
        )}

        {invitation_message && (
          <div className="bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-lg p-3 mb-3 border border-optio-purple/20">
            <p className="text-sm italic text-gray-800">
              "{invitation_message}"
            </p>
          </div>
        )}

        <div className="flex items-center gap-3 text-xs text-gray-500">
          {quest?.quest_type && (
            <span className="px-2 py-1 bg-gray-100 rounded">
              {quest.quest_type}
            </span>
          )}
          {quest?.pillar && (
            <span className="px-2 py-1 bg-gradient-to-r from-optio-purple/20 to-optio-pink/20 rounded">
              {quest.pillar}
            </span>
          )}
        </div>
      </CardBody>

      <CardFooter>
        <div className="flex gap-3">
          <button
            onClick={() => onAccept(invitation.id)}
            disabled={isLoading}
            className="flex-1 bg-gradient-to-r from-optio-purple to-optio-pink text-white px-4 py-2 rounded-lg font-semibold hover:shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? 'Processing...' : 'Accept Quest'}
          </button>
          <button
            onClick={() => onDecline(invitation.id)}
            disabled={isLoading}
            className="px-4 py-2 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Decline
          </button>
        </div>
      </CardFooter>
    </Card>
  );
};

export default InvitationCard;
