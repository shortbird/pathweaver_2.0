import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getPillarData } from '../../utils/pillarMappings';
import { getQuestHeaderImageSync } from '../../utils/questSourceConfig';
import { MapPinIcon, CalendarIcon, ArrowTopRightOnSquareIcon, BookOpenIcon, ArrowLeftIcon, AcademicCapIcon, PencilSquareIcon, ChevronDownIcon } from '@heroicons/react/24/outline';

/**
 * QuestDetailHeader - Hero section with background image, title, progress, and metadata
 */
const QuestDetailHeader = ({
  quest,
  completedTasks,
  totalTasks,
  progressPercentage,
  earnedXP,
  pillarBreakdown,
  isQuestCompleted,
  onEndQuest,
  endQuestMutation
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showDetails, setShowDetails] = useState(false);

  const getLocationDisplay = () => {
    if (!quest?.metadata) return null;

    const { location_type, venue_name, location_address } = quest.metadata;

    if (location_type === 'anywhere') return 'Anywhere';
    if (location_type === 'specific_location') {
      if (venue_name && location_address) {
        return `${venue_name}, ${location_address}`;
      } else if (venue_name) {
        return venue_name;
      } else if (location_address) {
        return location_address;
      }
    }

    return null;
  };

  const getSeasonalDisplay = () => {
    if (!quest?.metadata?.seasonal_start) return null;

    const startDate = new Date(quest.metadata.seasonal_start).toLocaleDateString();
    const endDate = quest.metadata.seasonal_end ?
      new Date(quest.metadata.seasonal_end).toLocaleDateString() : 'Ongoing';

    return `${startDate} - ${endDate}`;
  };

  const locationDisplay = getLocationDisplay();
  const seasonalDisplay = getSeasonalDisplay();

  // Get quest header image
  const questImage = quest?.image_url || quest?.header_image_url || getQuestHeaderImageSync(quest?.quest_type);

  // Check if this is a Spark LMS quest
  const isSparkQuest = quest?.lms_platform === 'spark';
  const sparkLogoUrl = 'https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/logos/onfire.png';

  return (
    <div className="relative w-full overflow-hidden pb-4">
      {isSparkQuest ? (
        // Spark LMS: White background with logo on right
        <>
          <div className="absolute inset-0 bg-white" />
          <div
            className="absolute right-0 top-0 bottom-0 w-1/3 bg-no-repeat bg-right bg-contain opacity-20"
            style={{ backgroundImage: `url(${sparkLogoUrl})` }}
          />
        </>
      ) : (
        // Regular quest: Background Image
        <>
          <div
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${questImage})` }}
          />
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/90 to-white/70" />
        </>
      )}

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4">
        {/* Back Button and Action Buttons */}
        <div className="flex items-center justify-between mb-3">
          <button
            onClick={() => {
              // Check if we came from a course lesson
              const returnInfoStr = sessionStorage.getItem('courseTaskReturnInfo');
              if (returnInfoStr) {
                try {
                  const returnInfo = JSON.parse(returnInfoStr);
                  sessionStorage.removeItem('courseTaskReturnInfo');
                  navigate(returnInfo.pathname + returnInfo.search);
                  return;
                } catch (e) {
                  // Fall through to default
                }
              }
              navigate('/dashboard');
            }}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors text-sm"
            style={{ fontFamily: 'Poppins' }}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            BACK
          </button>

          <div className="flex items-center gap-2">
            {/* View on Diploma Button - Show when tasks completed */}
            {completedTasks > 0 && (
              <button
                onClick={() => navigate('/diploma')}
                className="flex items-center gap-2 px-3 py-1.5 bg-white/90 backdrop-blur-sm text-optio-purple border border-purple-200 rounded-full hover:bg-white hover:border-purple-300 transition-all text-sm font-medium"
                style={{ fontFamily: 'Poppins' }}
              >
                <BookOpenIcon className="w-4 h-4" />
                Diploma
              </button>
            )}
          </div>
        </div>

        {/* Title Row with Progress */}
        <div className="flex items-start gap-6 mb-3">
          {/* Title and Quick Actions */}
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2 truncate" style={{ fontFamily: 'Poppins' }}>
              {quest?.title}
            </h1>

            {/* Compact Progress Bar */}
            {(quest?.user_enrollment || isQuestCompleted) && (
              <div className="flex items-center gap-3 mb-2">
                <div className="flex-1 max-w-xs bg-gray-200 rounded-full h-3 overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-primary rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                  />
                </div>
                <span className="text-sm font-semibold text-gray-700" style={{ fontFamily: 'Poppins' }}>
                  {Math.round(progressPercentage)}%
                </span>
                <span className="text-sm text-gray-500" style={{ fontFamily: 'Poppins' }}>
                  {completedTasks}/{totalTasks} tasks
                </span>
              </div>
            )}

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Curriculum Button - conditional behavior based on quest type */}
              {/* For course quests with material_link: external link */}
              {/* For quests with has_curriculum: internal curriculum page */}
              {quest?.quest_type === 'course' && quest?.material_link ? (
                <a
                  href={quest.material_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full hover:shadow-lg transition-all text-sm font-semibold"
                  style={{ fontFamily: 'Poppins' }}
                >
                  <ArrowTopRightOnSquareIcon className="w-4 h-4" />
                  Curriculum
                </a>
              ) : quest?.has_curriculum && quest?.user_enrollment ? (
                <button
                  onClick={() => navigate(`/quests/${quest.id}/curriculum`)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full hover:shadow-lg transition-all text-sm font-semibold"
                  style={{ fontFamily: 'Poppins' }}
                >
                  <AcademicCapIcon className="w-4 h-4" />
                  Curriculum
                </button>
              ) : null}

              {quest?.has_curriculum && user && ['admin', 'superadmin', 'advisor', 'teacher'].includes(user.role) && (
                <button
                  onClick={() => navigate(`/quests/${quest.id}/curriculum/edit`)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-optio-purple text-optio-purple rounded-full hover:bg-optio-purple hover:text-white transition-all text-sm font-semibold"
                  style={{ fontFamily: 'Poppins' }}
                >
                  <PencilSquareIcon className="w-4 h-4" />
                  Edit Curriculum
                </button>
              )}

              {/* Set Down Quest / Mark Completed Button */}
              {quest?.user_enrollment && !isQuestCompleted && (
                quest?.lms_platform ? (
                  <button
                    onClick={() => {
                      if (window.confirm('Only mark this quest as completed if you are finished with the associated LMS class.\n\nIf you submit more evidence to this quest later, it will automatically be reactivated.')) {
                        onEndQuest();
                      }
                    }}
                    disabled={endQuestMutation.isPending}
                    className="px-4 py-2 bg-gradient-primary text-white rounded-full hover:shadow-lg transition-all text-sm font-semibold disabled:opacity-50"
                    style={{ fontFamily: 'Poppins' }}
                  >
                    {endQuestMutation.isPending ? 'Marking...' : 'Mark Completed'}
                  </button>
                ) : (
                  <button
                    onClick={onEndQuest}
                    disabled={endQuestMutation.isPending}
                    className="px-4 py-2 bg-gray-100 text-gray-700 border border-gray-300 rounded-full hover:bg-gray-200 transition-all text-sm font-semibold disabled:opacity-50"
                    style={{ fontFamily: 'Poppins' }}
                  >
                    {endQuestMutation.isPending ? 'Setting Down...' : 'Set Down Quest'}
                  </button>
                )
              )}

              {/* Show Details Toggle */}
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-1 px-3 py-2 text-gray-500 hover:text-gray-700 transition-colors text-sm"
                style={{ fontFamily: 'Poppins' }}
              >
                <ChevronDownIcon className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
                {showDetails ? 'Hide Details' : 'Show Details'}
              </button>
            </div>
          </div>
        </div>

        {/* Collapsible Details Section */}
        {showDetails && (
          <div className="border-t border-gray-200 pt-4 mt-2 animate-fade-in">
            {/* Description */}
            {(quest?.big_idea || quest?.description) && (
              <p className="text-gray-700 mb-4 max-w-2xl" style={{ fontFamily: 'Poppins' }}>
                {quest?.big_idea || quest?.description}
              </p>
            )}

            {/* Metadata Row */}
            <div className="flex flex-wrap gap-4 items-center text-sm mb-4">
              {locationDisplay && (
                <div className="flex items-center gap-2 text-gray-600">
                  <MapPinIcon className="w-4 h-4" />
                  <span>{locationDisplay}</span>
                </div>
              )}

              {seasonalDisplay && (
                <div className="flex items-center gap-2 text-gray-600">
                  <CalendarIcon className="w-4 h-4" />
                  <span>{seasonalDisplay}</span>
                </div>
              )}
            </div>

            {/* Pillar XP Breakdown */}
            {Object.keys(pillarBreakdown).length > 0 && (
              <div className="flex flex-wrap gap-2 mb-4">
                {Object.entries(pillarBreakdown).map(([pillar, xp]) => {
                  const pillarData = getPillarData(pillar);
                  return (
                    <div
                      key={pillar}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium ${pillarData.bg} ${pillarData.text}`}
                    >
                      {pillarData.icon} {pillarData.name}: {xp} XP
                    </div>
                  );
                })}
              </div>
            )}

            {/* Stats Row */}
            {(quest?.user_enrollment || isQuestCompleted) && (
              <div className="flex flex-wrap items-center gap-2">
                <div className="px-3 py-1.5 bg-green-50 border border-green-200 rounded-lg text-center">
                  <div className="text-lg font-bold text-green-700" style={{ fontFamily: 'Poppins' }}>{completedTasks}</div>
                  <div className="text-xs text-green-600 font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>Completed</div>
                </div>
                <div className="px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-center">
                  <div className="text-lg font-bold text-blue-700" style={{ fontFamily: 'Poppins' }}>{totalTasks - completedTasks}</div>
                  <div className="text-xs text-blue-600 font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>Remaining</div>
                </div>
                <div className="px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg text-center">
                  <div className="text-lg font-bold text-purple-700" style={{ fontFamily: 'Poppins' }}>{earnedXP}</div>
                  <div className="text-xs text-optio-purple font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>XP Earned</div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestDetailHeader;
