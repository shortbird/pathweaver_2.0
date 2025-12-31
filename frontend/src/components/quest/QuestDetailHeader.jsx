import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { getQuestHeaderImageSync } from '../../utils/questSourceConfig';
import { useQuestEngagement } from '../../hooks/api/useQuests';
import RhythmIndicator from './RhythmIndicator';
import EngagementCalendar from './EngagementCalendar';
import RhythmExplainerModal from './RhythmExplainerModal';
import { MapPinIcon, CalendarIcon, ArrowTopRightOnSquareIcon, BookOpenIcon, ArrowLeftIcon, AcademicCapIcon, PencilSquareIcon, ChevronDownIcon, ArrowRightStartOnRectangleIcon } from '@heroicons/react/24/outline';

/**
 * QuestDetailHeader - Hero section with background image, title, rhythm indicator, and metadata
 *
 * Process-focused design: Celebrates learning rhythm over completion metrics.
 */
const QuestDetailHeader = ({
  quest,
  earnedXP,
  isQuestCompleted,
  onEndQuest,
  endQuestMutation
}) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [showDetails, setShowDetails] = useState(false);
  const [showRhythmModal, setShowRhythmModal] = useState(false);

  // Fetch engagement/rhythm data for enrolled users
  const { data: engagement } = useQuestEngagement(
    quest?.user_enrollment ? quest.id : null
  );

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
    <div className="relative w-full overflow-hidden pb-2 sm:pb-4">
      {isSparkQuest ? (
        // Spark LMS: White background with logo on right
        <>
          <div className="absolute inset-0 bg-white" />
          <div
            className="absolute right-0 top-0 bottom-0 w-1/3 bg-no-repeat bg-right bg-contain opacity-20 hidden sm:block"
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
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-white/80 sm:from-white sm:via-white/90 sm:to-white/70" />
        </>
      )}

      {/* Content */}
      <div className="relative max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 pt-1 sm:pt-4">
        {/* Mobile: Compact single-row header */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => {
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
            className="flex items-center gap-1 text-gray-600 hover:text-gray-900 transition-colors text-xs sm:text-sm min-h-[32px] sm:min-h-[44px] touch-manipulation"
            style={{ fontFamily: 'Poppins' }}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span className="hidden sm:inline">BACK</span>
          </button>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Diploma - icon only on mobile (show if user has any engagement) */}
            {(quest?.user_enrollment || isQuestCompleted) && (
              <button
                onClick={() => navigate('/diploma')}
                className="flex items-center justify-center gap-1 p-2 sm:px-3 sm:py-1.5 bg-white/90 backdrop-blur-sm text-optio-purple border border-purple-200 rounded-full hover:bg-white hover:border-purple-300 transition-all text-xs sm:text-sm font-medium min-h-[36px] min-w-[36px] sm:min-w-0 touch-manipulation"
                style={{ fontFamily: 'Poppins' }}
                title="View Diploma"
              >
                <BookOpenIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Diploma</span>
              </button>
            )}
            {/* End Quest Button - pill style */}
            {quest?.user_enrollment && !isQuestCompleted && !quest?.lms_platform && (
              <button
                onClick={onEndQuest}
                disabled={endQuestMutation.isPending}
                className="flex items-center justify-center gap-1 p-2 sm:px-3 sm:py-1.5 bg-white/90 backdrop-blur-sm text-red-500 border border-red-200 rounded-full hover:bg-red-50 hover:border-red-300 hover:text-red-600 transition-all text-xs sm:text-sm font-medium min-h-[36px] min-w-[36px] sm:min-w-0 touch-manipulation disabled:opacity-50"
                style={{ fontFamily: 'Poppins' }}
                title="End Quest"
              >
                <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                <span className="hidden sm:inline">{endQuestMutation.isPending ? '...' : 'End Quest'}</span>
              </button>
            )}
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 mb-1 sm:mb-2 break-words leading-tight" style={{ fontFamily: 'Poppins' }}>
          {quest?.title}
        </h1>

        {/* Rhythm Indicator - replaces progress bar */}
        {(quest?.user_enrollment || isQuestCompleted) && engagement?.rhythm && (
          <div className="mb-2">
            <RhythmIndicator
              state={engagement.rhythm.state}
              stateDisplay={engagement.rhythm.state_display}
              message={engagement.rhythm.message}
              patternDescription={engagement.rhythm.pattern_description}
              onClick={() => setShowRhythmModal(true)}
            />
          </div>
        )}

        {/* Action Buttons - horizontal scroll on mobile */}
        <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {/* Curriculum Button */}
          {quest?.quest_type === 'course' && quest?.material_link ? (
            <a
              href={quest.material_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full hover:shadow-lg transition-all text-xs sm:text-sm font-semibold min-h-[32px] sm:min-h-[44px] whitespace-nowrap touch-manipulation"
              style={{ fontFamily: 'Poppins' }}
            >
              <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Curriculum
            </a>
          ) : quest?.has_curriculum && quest?.user_enrollment ? (
            <button
              onClick={() => navigate(`/quests/${quest.id}/curriculum`)}
              className="inline-flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full hover:shadow-lg transition-all text-xs sm:text-sm font-semibold min-h-[32px] sm:min-h-[44px] whitespace-nowrap touch-manipulation"
              style={{ fontFamily: 'Poppins' }}
            >
              <AcademicCapIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              Curriculum
            </button>
          ) : null}

          {quest?.has_curriculum && user && ['admin', 'superadmin', 'advisor', 'teacher'].includes(user.role) && (
            <button
              onClick={() => navigate(`/quests/${quest.id}/curriculum/edit`)}
              className="inline-flex items-center gap-1 px-3 py-1.5 sm:px-4 sm:py-2 bg-white border border-optio-purple text-optio-purple rounded-full hover:bg-optio-purple hover:text-white transition-all text-xs sm:text-sm font-semibold min-h-[32px] sm:min-h-[44px] whitespace-nowrap touch-manipulation"
              style={{ fontFamily: 'Poppins' }}
            >
              <PencilSquareIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Edit Curriculum</span>
              <span className="sm:hidden">Edit</span>
            </button>
          )}

          {/* Mark Completed Button - LMS quests only */}
          {quest?.user_enrollment && !isQuestCompleted && quest?.lms_platform && (
            <button
              onClick={() => {
                if (window.confirm('Only mark this quest as completed if you are finished with the associated LMS class.\n\nIf you submit more evidence to this quest later, it will automatically be reactivated.')) {
                  onEndQuest();
                }
              }}
              disabled={endQuestMutation.isPending}
              className="px-3 py-1.5 bg-gradient-primary text-white rounded-full hover:shadow-lg transition-all text-xs font-semibold disabled:opacity-50 min-h-[32px] whitespace-nowrap touch-manipulation"
              style={{ fontFamily: 'Poppins' }}
            >
              {endQuestMutation.isPending ? 'Marking...' : 'Complete'}
            </button>
          )}

          {/* Show Details Toggle */}
          <button
            onClick={() => setShowDetails(!showDetails)}
            className="flex items-center gap-1 px-3 py-1.5 text-gray-500 hover:text-gray-700 transition-colors text-xs sm:text-sm min-h-[32px] whitespace-nowrap touch-manipulation"
            style={{ fontFamily: 'Poppins' }}
          >
            <ChevronDownIcon className={`w-4 h-4 transition-transform ${showDetails ? 'rotate-180' : ''}`} />
            <span>{showDetails ? 'Less' : 'More'}</span>
          </button>
        </div>

        {/* Collapsible Details Section */}
        {showDetails && (
          <div className="border-t border-gray-200 pt-3 sm:pt-4 mt-2 animate-fade-in">
            {/* Two-column layout: Description left, Journey right */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
              {/* Left column: Description and metadata */}
              <div>
                {/* Description */}
                {(quest?.big_idea || quest?.description) && (
                  <p className="text-sm sm:text-base text-gray-700 mb-3" style={{ fontFamily: 'Poppins' }}>
                    {quest?.big_idea || quest?.description}
                  </p>
                )}

                {/* Metadata Row */}
                <div className="flex flex-wrap gap-2 sm:gap-4 items-center text-xs sm:text-sm">
                  {locationDisplay && (
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <MapPinIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>{locationDisplay}</span>
                    </div>
                  )}

                  {seasonalDisplay && (
                    <div className="flex items-center gap-1.5 text-gray-600">
                      <CalendarIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                      <span>{seasonalDisplay}</span>
                    </div>
                  )}

                  {/* XP Earned - inline with metadata */}
                  {(quest?.user_enrollment || isQuestCompleted) && earnedXP > 0 && (
                    <div className="flex items-center gap-1.5 text-optio-purple font-medium">
                      <span>{earnedXP} XP earned</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Right column: Engagement Calendar */}
              {(quest?.user_enrollment || isQuestCompleted) && engagement?.calendar && (
                <div className="md:border-l md:border-gray-200 md:pl-6">
                  <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2" style={{ fontFamily: 'Poppins' }}>
                    Your Journey
                  </div>
                  <EngagementCalendar
                    days={engagement.calendar.days}
                    weeksActive={engagement.calendar.weeks_active}
                    firstActivityDate={engagement.calendar.first_activity_date}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Rhythm Explainer Modal */}
      <RhythmExplainerModal
        isOpen={showRhythmModal}
        onClose={() => setShowRhythmModal(false)}
        currentState={engagement?.rhythm?.state}
      />
    </div>
  );
};

export default QuestDetailHeader;
