import React from 'react';
import { useNavigate } from 'react-router-dom';
import { getPillarData } from '../../utils/pillarMappings';
import { getQuestHeaderImageSync } from '../../utils/questSourceConfig';
import { MapPinIcon, CalendarIcon, ArrowTopRightOnSquareIcon, BookOpenIcon, ArrowLeftIcon } from '@heroicons/react/24/outline';

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
    <div className="relative min-h-[500px] w-full overflow-hidden pb-8">
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
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent" />
        </>
      )}

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
        {/* Back Button and View on Diploma Button */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
            style={{ fontFamily: 'Poppins' }}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            BACK
          </button>

          {completedTasks > 0 && (
            <button
              onClick={() => navigate('/diploma')}
              className="flex items-center gap-2 px-4 py-2 bg-white/90 backdrop-blur-sm text-optio-purple border-2 border-purple-200 rounded-full hover:bg-white hover:border-purple-300 hover:shadow-lg transition-all font-semibold"
              style={{ fontFamily: 'Poppins' }}
            >
              <BookOpenIcon className="w-4 h-4" />
              VIEW ON DIPLOMA
            </button>
          )}
        </div>

        {/* Quest Title and Description */}
        <div className="max-w-2xl mb-6">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins' }}>
            {quest?.title}
          </h1>
          <p className="text-lg text-gray-700 leading-relaxed mb-6" style={{ fontFamily: 'Poppins' }}>
            {quest?.big_idea || quest?.description}
          </p>

          {/* Visit Course Button - Only show for course quests with material_link */}
          {quest?.quest_type === 'course' && quest?.material_link && (
            <a
              href={quest.material_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full hover:shadow-lg hover:scale-105 transition-all duration-300 font-semibold text-base w-full sm:w-auto justify-center"
              style={{ fontFamily: 'Poppins' }}
            >
              <ArrowTopRightOnSquareIcon className="w-5 h-5" />
              VISIT COURSE
            </a>
          )}
        </div>

        {/* Quest Metadata */}
        <div className="max-w-2xl mb-6">
          <div className="flex flex-wrap gap-4 items-center text-sm mb-4">
            {locationDisplay && (
              <div className="flex items-center gap-2 text-gray-700">
                <MapPinIcon className="w-4 h-4" />
                <span>{locationDisplay}</span>
              </div>
            )}

            {seasonalDisplay && (
              <div className="flex items-center gap-2 text-gray-700">
                <CalendarIcon className="w-4 h-4" />
                <span>{seasonalDisplay}</span>
              </div>
            )}
          </div>

          {/* Pillar XP Breakdown */}
          {Object.keys(pillarBreakdown).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(pillarBreakdown).map(([pillar, xp]) => {
                const pillarData = getPillarData(pillar);
                return (
                  <div
                    key={pillar}
                    className={`px-3 py-1 rounded-full text-sm font-medium ${pillarData.bg} ${pillarData.text}`}
                  >
                    {pillarData.icon} {pillarData.name}: {xp} XP
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Progress Bar and Stats */}
        {(quest?.user_enrollment || isQuestCompleted) && (
          <div className="max-w-2xl">
            {/* Progress Bar */}
            <div className="w-full bg-gray-200 rounded-full h-6 mb-4 overflow-hidden relative">
              <div
                className="h-full bg-gradient-primary rounded-full transition-all duration-1000 ease-out"
                style={{ width: `${progressPercentage}%` }}
              />
              <div className="absolute inset-0 flex items-center justify-center text-sm font-bold text-gray-700" style={{ fontFamily: 'Poppins' }}>
                {Math.round(progressPercentage)}%
              </div>
            </div>

            {/* Stats Row with Set Down Quest Button */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="px-4 py-2 bg-green-50 border-2 border-green-200 rounded-lg text-center">
                <div className="text-xl font-bold text-green-700" style={{ fontFamily: 'Poppins' }}>{completedTasks}</div>
                <div className="text-xs text-green-600 font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>Completed</div>
              </div>
              <div className="px-4 py-2 bg-blue-50 border-2 border-blue-200 rounded-lg text-center">
                <div className="text-xl font-bold text-blue-700" style={{ fontFamily: 'Poppins' }}>{totalTasks - completedTasks}</div>
                <div className="text-xs text-blue-600 font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>Remaining</div>
              </div>
              <div className="px-4 py-2 bg-purple-50 border-2 border-purple-200 rounded-lg text-center">
                <div className="text-xl font-bold text-purple-700" style={{ fontFamily: 'Poppins' }}>{earnedXP}</div>
                <div className="text-xs text-optio-purple font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>XP Earned</div>
              </div>
              <div className="px-4 py-2 bg-gray-100 border-2 border-gray-300 rounded-lg text-center">
                <div className="text-xl font-bold text-gray-700" style={{ fontFamily: 'Poppins' }}>{completedTasks}/{totalTasks}</div>
                <div className="text-xs text-gray-600 font-medium uppercase tracking-wide" style={{ fontFamily: 'Poppins' }}>Tasks</div>
              </div>

              {/* Set Down Quest / Mark Completed Button */}
              {quest?.user_enrollment && !isQuestCompleted && (
                quest?.lms_platform ? (
                  <button
                    onClick={() => {
                      if (window.confirm('⚠️ Only mark this quest as completed if you are finished with the associated LMS class.\n\nIf you submit more evidence to this quest later, it will automatically be reactivated.')) {
                        onEndQuest();
                      }
                    }}
                    disabled={endQuestMutation.isPending}
                    className="px-6 py-2 bg-gradient-primary text-white rounded-full hover:shadow-lg transition-all font-bold disabled:opacity-50 ml-auto"
                    style={{ fontFamily: 'Poppins' }}
                  >
                    {endQuestMutation.isPending ? 'Marking Complete...' : 'MARK QUEST COMPLETED'}
                  </button>
                ) : (
                  <button
                    onClick={onEndQuest}
                    disabled={endQuestMutation.isPending}
                    className="px-6 py-2 bg-gradient-primary text-white rounded-full hover:shadow-lg transition-all font-bold disabled:opacity-50 ml-auto"
                    style={{ fontFamily: 'Poppins' }}
                  >
                    {endQuestMutation.isPending ? 'Setting Down...' : 'SET DOWN QUEST'}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestDetailHeader;
