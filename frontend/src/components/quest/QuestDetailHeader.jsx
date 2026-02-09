import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import { getQuestHeaderImageSync } from '../../utils/questSourceConfig';
import { useQuestEngagement } from '../../hooks/api/useQuests';
import RhythmIndicator from './RhythmIndicator';
import EngagementCalendar from './EngagementCalendar';
import RhythmExplainerModal from './RhythmExplainerModal';
import {
  ArrowTopRightOnSquareIcon,
  BookOpenIcon,
  ArrowLeftIcon,
  AcademicCapIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  ArrowRightStartOnRectangleIcon,
  ClockIcon,
  FireIcon,
  MapPinIcon
} from '@heroicons/react/24/outline';

/**
 * QuestDetailHeader - Hero section with image, overlaid title/description
 *
 * Features title and description on the left with image fading from left to right.
 * Rhythm indicator shown for enrolled users.
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
  const [showJourney, setShowJourney] = useState(false);
  const [showRhythmModal, setShowRhythmModal] = useState(false);
  const [imageError, setImageError] = useState(false);

  // Fetch engagement/rhythm data for enrolled users
  const { data: engagement } = useQuestEngagement(
    quest?.user_enrollment ? quest.id : null
  );

  // Get quest header image
  const questImage = quest?.image_url || quest?.header_image_url || getQuestHeaderImageSync(quest?.quest_type);

  // Check if this is a Spark LMS quest
  const isSparkQuest = quest?.lms_platform === 'spark';
  const sparkLogoUrl = 'https://vvfgxcykxjybtvpfzwyx.supabase.co/storage/v1/object/public/site-assets/logos/onfire.png';

  // Extract metadata
  const metadata = quest?.metadata || {};
  const timeEstimate = metadata.estimated_hours || metadata.estimated_time;
  const intensity = metadata.intensity;
  const locationDisplay = getLocationDisplay(metadata);

  // Get pillar-based fallback gradient colors
  const getPillarGradient = () => {
    const pillar = quest?.pillar_primary || 'stem';
    const gradients = {
      stem: 'from-blue-500 to-purple-600',
      wellness: 'from-green-500 to-teal-600',
      communication: 'from-amber-500 to-orange-600',
      civics: 'from-indigo-500 to-blue-600',
      art: 'from-pink-500 to-rose-600'
    };
    return gradients[pillar] || 'from-optio-purple to-optio-pink';
  };

  function getLocationDisplay(metadata) {
    if (!metadata) return null;
    const { location_type, venue_name, location_address } = metadata;

    if (location_type === 'anywhere') return 'Anywhere';
    if (location_type === 'specific_location') {
      if (venue_name) return venue_name;
      if (location_address) return location_address;
    }
    return null;
  }

  const handleBackClick = () => {
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
  };

  const isEnrolled = quest?.user_enrollment;
  const totalXP = quest?.metadata?.total_xp || quest?.xp_value || 0;

  return (
    <div className="bg-white">
      {/* Hero Section with Image and Overlaid Content */}
      <div className="relative w-full min-h-[150px] sm:min-h-[175px] md:min-h-[200px] overflow-hidden">
        {/* Background Image */}
        {isSparkQuest ? (
          <div className="absolute inset-0 bg-gradient-to-r from-orange-50 to-amber-50">
            <img
              src={sparkLogoUrl}
              alt="Spark LMS"
              className="absolute right-4 top-1/2 -translate-y-1/2 h-3/4 opacity-20 object-contain"
            />
          </div>
        ) : !imageError ? (
          <img
            src={questImage}
            alt={`${quest?.title || 'Quest'}`}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImageError(true)}
            fetchpriority="high"
          />
        ) : (
          <div className={`absolute inset-0 bg-gradient-to-br ${getPillarGradient()}`} />
        )}

        {/* Gradient overlay - fades from white on left to transparent on right */}
        <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-transparent sm:via-white/90 sm:to-white/20" />

        {/* Content overlay */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          {/* Back button - absolute positioned */}
          <button
            onClick={handleBackClick}
            className="absolute top-3 left-4 sm:left-6 lg:left-8 flex items-center gap-1.5 text-gray-700 hover:text-gray-900 transition-colors text-sm font-medium bg-white/90 backdrop-blur-sm px-3 py-2 rounded-full shadow-sm min-h-[44px] touch-manipulation"
            style={{ fontFamily: 'Poppins' }}
          >
            <ArrowLeftIcon className="w-4 h-4" />
            <span>Back</span>
          </button>

          {/* Action buttons - absolute positioned top right */}
          <div className="absolute top-3 right-4 sm:right-6 lg:right-8 flex items-center gap-2">
            {(isEnrolled || isQuestCompleted) && (
              <button
                onClick={() => navigate('/diploma')}
                className="flex items-center gap-1.5 px-3 py-2 bg-white/90 backdrop-blur-sm text-optio-purple border border-purple-200 rounded-full hover:bg-white transition-all text-sm font-medium shadow-sm min-h-[44px] touch-manipulation"
                style={{ fontFamily: 'Poppins' }}
              >
                <BookOpenIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Diploma</span>
              </button>
            )}

            {isEnrolled && !isQuestCompleted && !quest?.lms_platform && (
              quest?.active_course_enrollment ? (
                <button
                  onClick={() => toast.error('This quest is part of an active course. Unenroll from the course first.')}
                  className="flex items-center gap-1.5 px-3 py-2 bg-gray-100/90 backdrop-blur-sm text-gray-400 border border-gray-200 rounded-full cursor-not-allowed text-sm font-medium min-h-[44px] touch-manipulation"
                  style={{ fontFamily: 'Poppins' }}
                >
                  <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">End</span>
                </button>
              ) : (
                <button
                  onClick={onEndQuest}
                  disabled={endQuestMutation?.isPending}
                  className="flex items-center gap-1.5 px-3 py-2 bg-white/90 backdrop-blur-sm text-red-500 border border-red-200 rounded-full hover:bg-red-50 transition-all text-sm font-medium shadow-sm disabled:opacity-50 min-h-[44px] touch-manipulation"
                  style={{ fontFamily: 'Poppins' }}
                >
                  <ArrowRightStartOnRectangleIcon className="w-4 h-4" />
                  <span className="hidden sm:inline">{endQuestMutation?.isPending ? '...' : 'End'}</span>
                </button>
              )
            )}
          </div>

          {/* Title and XP badge - pt-14 clears the absolute positioned back button */}
          <div className="max-w-xl sm:max-w-2xl pt-14 pb-2">
            {totalXP > 0 && (
              <div className="inline-block mb-1 px-2 py-0.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full text-xs font-semibold shadow-sm">
                {totalXP} XP
              </div>
            )}

            <h1
              className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 leading-tight line-clamp-2"
              style={{ fontFamily: 'Poppins' }}
            >
              {quest?.title}
            </h1>

            {(quest?.big_idea || quest?.description) && (
              <p
                className="text-xs sm:text-sm text-gray-700 mt-1 leading-relaxed line-clamp-2"
                style={{ fontFamily: 'Poppins' }}
              >
                {quest?.big_idea || quest?.description}
              </p>
            )}

            {/* Engagement/Rhythm Section - inline in hero */}
            {(isEnrolled || isQuestCompleted) && engagement?.rhythm && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <RhythmIndicator
                  state={engagement.rhythm.state}
                  stateDisplay={engagement.rhythm.state_display}
                  message={engagement.rhythm.message}
                  patternDescription={engagement.rhythm.pattern_description}
                  onClick={() => setShowRhythmModal(true)}
                  compact
                />

                {/* Engagement Calendar Toggle */}
                {engagement?.calendar && (
                  <button
                    onClick={() => setShowJourney(!showJourney)}
                    className="flex items-center gap-1 text-xs text-gray-600 hover:text-optio-purple transition-colors bg-white/80 backdrop-blur-sm px-2 py-1 rounded-full"
                    style={{ fontFamily: 'Poppins' }}
                  >
                    <ChevronDownIcon className={`w-3.5 h-3.5 transition-transform ${showJourney ? 'rotate-180' : ''}`} />
                    <span>{showJourney ? 'Hide' : 'Show'} journey</span>
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Engagement Calendar (collapsible) - expands hero when shown */}
          {showJourney && engagement?.calendar && (
            <div className="max-w-xl sm:max-w-2xl pb-3 animate-fade-in">
              <div className="bg-white/90 backdrop-blur-sm rounded-lg p-3 border border-gray-200">
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2" style={{ fontFamily: 'Poppins' }}>
                  Your Journey
                </div>
                <EngagementCalendar
                  days={engagement.calendar.days}
                  weeksActive={engagement.calendar.weeks_active}
                  firstActivityDate={engagement.calendar.first_activity_date}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Content Below Hero */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
        {/* Metadata Pills */}
        {(timeEstimate || intensity || locationDisplay || ((isEnrolled || isQuestCompleted) && earnedXP > 0)) && (
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {timeEstimate && (
              <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                <ClockIcon className="w-3.5 h-3.5" />
                <span>{timeEstimate}{typeof timeEstimate === 'number' && 'h'}</span>
              </div>
            )}
            {intensity && (
              <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                <FireIcon className="w-3.5 h-3.5" />
                <span className="capitalize">{intensity}</span>
              </div>
            )}
            {locationDisplay && (
              <div className="flex items-center gap-1 px-2.5 py-1 bg-gray-100 rounded-full text-xs text-gray-600">
                <MapPinIcon className="w-3.5 h-3.5" />
                <span>{locationDisplay}</span>
              </div>
            )}
            {(isEnrolled || isQuestCompleted) && earnedXP > 0 && (
              <div className="flex items-center gap-1 px-2.5 py-1 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-full text-xs font-medium text-optio-purple">
                <span>{earnedXP} XP earned</span>
              </div>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Curriculum Button */}
          {quest?.quest_type === 'course' && quest?.material_link ? (
            <a
              href={quest.material_link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full hover:shadow-lg transition-all text-sm font-semibold min-h-[44px] touch-manipulation"
              style={{ fontFamily: 'Poppins' }}
            >
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              View Curriculum
            </a>
          ) : quest?.has_curriculum && isEnrolled ? (
            <button
              onClick={() => navigate(`/quests/${quest.id}/curriculum`)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full hover:shadow-lg transition-all text-sm font-semibold min-h-[44px] touch-manipulation"
              style={{ fontFamily: 'Poppins' }}
            >
              <AcademicCapIcon className="w-4 h-4" />
              View Curriculum
            </button>
          ) : null}

          {/* Edit Curriculum - for admins/advisors */}
          {quest?.has_curriculum && user && ['admin', 'superadmin', 'advisor', 'teacher'].includes(user.role) && (
            <button
              onClick={() => navigate(`/quests/${quest.id}/curriculum/edit`)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-optio-purple text-optio-purple rounded-full hover:bg-optio-purple hover:text-white transition-all text-sm font-semibold min-h-[44px] touch-manipulation"
              style={{ fontFamily: 'Poppins' }}
            >
              <PencilSquareIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Edit Curriculum</span>
              <span className="sm:hidden">Edit</span>
            </button>
          )}

          {/* Mark Completed Button - LMS quests only */}
          {isEnrolled && !isQuestCompleted && quest?.lms_platform && (
            <button
              onClick={() => {
                if (window.confirm('Only mark this quest as completed if you are finished with the associated LMS class.\n\nIf you submit more evidence to this quest later, it will automatically be reactivated.')) {
                  onEndQuest();
                }
              }}
              disabled={endQuestMutation?.isPending}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full hover:shadow-lg transition-all text-sm font-semibold min-h-[44px] touch-manipulation disabled:opacity-50"
              style={{ fontFamily: 'Poppins' }}
            >
              {endQuestMutation?.isPending ? 'Marking...' : 'Mark Complete'}
            </button>
          )}
        </div>
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
