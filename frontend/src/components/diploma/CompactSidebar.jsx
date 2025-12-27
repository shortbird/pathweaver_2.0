import React, { useState } from 'react';
import PropTypes from 'prop-types';
import SkillsRadarChart from './SkillsRadarChart';
import BadgeCarouselCard from '../hub/BadgeCarouselCard';
import {
  getAllCreditProgress,
  calculateTotalCredits,
  TOTAL_CREDITS_REQUIRED,
  meetsGraduationRequirements
} from '../../utils/creditRequirements';

const CompactSidebar = ({
  totalXP,
  subjectXP,
  earnedBadges,
  totalXPCount,
  isOwner,
  studentName,
  onCreditsClick,
  onBadgesClick
}) => {
  const [isRadarExpanded, setIsRadarExpanded] = useState(true);
  const [isBadgesExpanded, setIsBadgesExpanded] = useState(true);
  const [isCreditsExpanded, setIsCreditsExpanded] = useState(true);

  const totalCreditsEarned = calculateTotalCredits(subjectXP);
  const meetsRequirements = meetsGraduationRequirements(subjectXP);
  const creditProgress = getAllCreditProgress(subjectXP);

  return (
    <div className="compact-sidebar space-y-6">
      {/* Skills Radar Chart Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setIsRadarExpanded(!isRadarExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <h3 className="font-bold text-gray-800 text-sm">Learning Pillars</h3>
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${isRadarExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isRadarExpanded && (
          <div className="p-4 border-t border-gray-100">
            {Object.keys(totalXP).length > 0 ? (
              <div className="flex justify-center">
                <div className="w-full max-w-[280px]">
                  <SkillsRadarChart skillsXP={totalXP} compact={true} />
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                No skill data yet
              </p>
            )}

            {/* Total XP Display */}
            {totalXPCount > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-100 text-center">
                <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-optio-purple to-optio-pink">
                  {totalXPCount.toLocaleString()}
                </div>
                <div className="text-xs text-gray-500 uppercase tracking-wide">Total XP</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Credits Summary Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setIsCreditsExpanded(!isCreditsExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <h3 className="font-bold text-gray-800 text-sm">Diploma Credits</h3>
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${isCreditsExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isCreditsExpanded && (
          <div className="p-4 border-t border-gray-100">
            {/* Progress Bar */}
            <div className={`p-4 rounded-lg ${
              meetsRequirements
                ? 'bg-green-50 border border-green-200'
                : 'bg-blue-50 border border-blue-200'
            }`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-800">
                  {totalCreditsEarned.toFixed(1)}/{TOTAL_CREDITS_REQUIRED}
                </span>
                <span className={`text-xs font-medium ${
                  meetsRequirements ? 'text-green-600' : 'text-blue-600'
                }`}>
                  {Math.round((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    meetsRequirements
                      ? 'bg-gradient-to-r from-green-400 to-green-600'
                      : 'bg-gradient-to-r from-optio-purple to-optio-pink'
                  }`}
                  style={{
                    width: `${Math.min((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100, 100)}%`
                  }}
                ></div>
              </div>
              {meetsRequirements && (
                <div className="mt-2 flex items-center gap-1 text-green-700">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-medium">Meets requirements</span>
                </div>
              )}
            </div>

            {/* Top 3 Subjects */}
            {creditProgress.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Top Subjects</p>
                {creditProgress
                  .filter(c => c.creditsEarned > 0)
                  .slice(0, 3)
                  .map(credit => (
                    <div key={credit.subject} className="flex items-center justify-between text-xs">
                      <span className="text-gray-700 font-medium truncate flex-1">
                        {credit.displayName}
                      </span>
                      <span className="text-gray-500 ml-2">
                        {credit.creditsEarned.toFixed(1)}/{credit.creditsRequired}
                      </span>
                    </div>
                  ))}
              </div>
            )}

            {/* View Full Breakdown Link */}
            {onCreditsClick && (
              <button
                onClick={onCreditsClick}
                className="mt-4 w-full text-sm text-optio-purple hover:text-purple-800 font-medium text-center py-2 hover:bg-purple-50 rounded-lg transition-colors"
              >
                View Full Breakdown
              </button>
            )}
          </div>
        )}
      </div>

      {/* Badges Section */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <button
          onClick={() => setIsBadgesExpanded(!isBadgesExpanded)}
          className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors"
        >
          <h3 className="font-bold text-gray-800 text-sm">
            Badges ({earnedBadges.length})
          </h3>
          <svg
            className={`w-5 h-5 text-gray-500 transition-transform ${isBadgesExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {isBadgesExpanded && (
          <div className="p-4 border-t border-gray-100">
            {earnedBadges.length > 0 ? (
              <div className="space-y-3">
                {earnedBadges.slice(0, 3).map((badge) => (
                  <div
                    key={badge.badge_id || badge.id}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    <img
                      src={badge.image_url}
                      alt={`Badge: ${badge.name} - ${badge.pillar_primary || 'Achievement'} badge`}
                      className="w-12 h-12 object-contain flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">
                        {badge.name}
                      </p>
                      {badge.pillar_primary && (
                        <p className="text-xs text-gray-500">
                          {badge.pillar_primary}
                        </p>
                      )}
                    </div>
                  </div>
                ))}

                {earnedBadges.length > 3 && onBadgesClick && (
                  <button
                    onClick={onBadgesClick}
                    className="w-full text-sm text-optio-purple hover:text-purple-800 font-medium text-center py-2 hover:bg-purple-50 rounded-lg transition-colors"
                  >
                    View All {earnedBadges.length} Badges
                  </button>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-4">
                {isOwner
                  ? 'No badges earned yet'
                  : `${studentName} hasn't earned any badges yet`}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

CompactSidebar.propTypes = {
  totalXP: PropTypes.object.isRequired,
  subjectXP: PropTypes.object.isRequired,
  earnedBadges: PropTypes.array.isRequired,
  totalXPCount: PropTypes.number,
  isOwner: PropTypes.bool,
  studentName: PropTypes.string,
  onCreditsClick: PropTypes.func,
  onBadgesClick: PropTypes.func
};

export default CompactSidebar;
