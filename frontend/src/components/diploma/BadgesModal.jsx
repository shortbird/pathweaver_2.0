import React from 'react';
import BadgeCarouselCard from '../hub/BadgeCarouselCard';

const BadgesModal = ({ isOpen, onClose, earnedBadges, isOwner, getStudentFirstName }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 p-6 bg-gradient-primary z-10">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">Earned Badges</h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          <p className="text-gray-600 text-center mb-6">
            Recognition of mastery and achievement across learning pillars
          </p>

          {earnedBadges.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {earnedBadges.map((userBadge) => (
                <BadgeCarouselCard
                  key={userBadge.badge_id || userBadge.id}
                  badge={userBadge}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <p className="text-gray-500">
                {isOwner
                  ? 'No badges earned yet - complete quests to earn your first badge!'
                  : `${getStudentFirstName()} hasn't earned any badges yet.`
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default BadgesModal;
