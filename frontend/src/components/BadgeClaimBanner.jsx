import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

/**
 * BadgeClaimBanner
 *
 * Notification banner that appears when badges are available to claim.
 * Dismissible and tracks notification state per badge.
 *
 * Philosophy-aligned: Celebrates achievement without being pushy
 */
const BadgeClaimBanner = () => {
  const [claimableBadges, setClaimableBadges] = useState([]);
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  useEffect(() => {
    fetchClaimableBadges();
  }, []);

  const fetchClaimableBadges = async () => {
    try {
      const response = await api.get('/badges/claimable');

      if (response.data.has_claimable && response.data.count > 0) {
        setClaimableBadges(response.data.badges);
        setIsVisible(true);
      }
    } catch (error) {
      console.error('Error fetching claimable badges:', error);
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
    setIsVisible(false);
  };

  if (!isVisible || isDismissed || claimableBadges.length === 0) {
    return null;
  }

  const badgeCount = claimableBadges.length;
  const firstBadge = claimableBadges[0];

  return (
    <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-40 w-full max-w-2xl px-4 animate-slide-down">
      <div className="bg-gradient-to-r from-purple-600 to-pink-600 rounded-lg shadow-2xl p-4">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center">
              <span className="text-2xl">🏆</span>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 text-white">
            <h3 className="font-bold text-lg">
              {badgeCount === 1
                ? 'Badge Ready to Claim!'
                : `${badgeCount} Badges Ready to Claim!`}
            </h3>
            <p className="text-purple-100 mt-1">
              {badgeCount === 1
                ? `You've earned the "${firstBadge.badges?.name}" badge. Claim it now!`
                : `You've earned ${badgeCount} new badges. Claim them to display on your diploma!`}
            </p>

            {/* Action Buttons */}
            <div className="flex gap-3 mt-3">
              <Link
                to="/badges"
                className="px-4 py-2 bg-white text-purple-700 rounded-lg font-semibold hover:bg-purple-50 transition-colors shadow-md"
              >
                Claim {badgeCount === 1 ? 'Badge' : 'Badges'}
              </Link>

              <button
                onClick={handleDismiss}
                className="px-4 py-2 bg-purple-700 bg-opacity-50 text-white rounded-lg font-medium hover:bg-opacity-70 transition-colors"
              >
                Later
              </button>
            </div>
          </div>

          {/* Close Button */}
          <button
            onClick={handleDismiss}
            className="flex-shrink-0 text-white hover:text-purple-200 transition-colors"
            aria-label="Close"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
};

export default BadgeClaimBanner;
