import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../contexts/AuthContext';
import toast from 'react-hot-toast';
import api from '../../services/api';
import { queryKeys } from '../../utils/queryKeys';
import { getQuestHeaderImageSync } from '../../utils/questSourceConfig';
import { useQuestEngagement } from '../../hooks/api/useQuests';
import RhythmIndicator from './RhythmIndicator';
import EngagementCalendar from './EngagementCalendar';
import RhythmExplainerModal from './RhythmExplainerModal';
import {
  ArrowTopRightOnSquareIcon,
  ArrowLeftIcon,
  AcademicCapIcon,
  PencilSquareIcon,
  ChevronDownIcon,
  ClockIcon,
  FireIcon,
  MapPinIcon
} from '@heroicons/react/24/outline';
import { isFocusMode } from '../../utils/focusMode';
import { useConfirm } from '../../contexts/ConfirmContext'

const stripHtml = (html) => {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return doc.body.textContent || '';
};

/**
 * QuestTitle - the quest's name, editable in place by whoever created it.
 *
 * Gryffin, 2026-08-31: "my son did a quest today on changing the van brake
 * light. I accidentally typed battery, there is no way to change the title."
 * Every quest-editing surface in the app is admin-gated, so the creator of a
 * personal quest had no way to fix their own typo. The backend
 * (PATCH /api/quests/:id) is the authority on who may rename; `can_rename` on
 * the quest payload only decides whether we draw the pencil.
 */
const QuestTitle = ({ quest, className }) => {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const start = () => {
    setDraft(quest?.title || '');
    setEditing(true);
  };

  const save = async () => {
    const title = draft.trim();
    if (!title || title === quest?.title) {
      setEditing(false);
      return;
    }
    try {
      setSaving(true);
      const { data } = await api.patch(`/api/quests/${quest.id}`, { title });
      if (!data?.success) throw new Error(data?.error || 'Failed to rename quest');
      // Show the new name immediately, then let the lists catch up.
      queryClient.setQueryData(queryKeys.quests.detail(quest.id), (old) =>
        old ? { ...old, title } : old
      );
      queryClient.invalidateQueries(queryKeys.quests.all);
      setEditing(false);
      toast.success('Quest renamed');
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Failed to rename quest');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <div className="flex items-start gap-2">
        <h1 className={className}>{quest?.title}</h1>
        {quest?.can_rename && (
          <button
            type="button"
            onClick={start}
            aria-label="Rename quest"
            title="Rename quest"
            className="mt-1 p-1 text-gray-400 hover:text-optio-purple transition-colors flex-shrink-0"
          >
            <PencilSquareIcon className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <input
        autoFocus
        value={draft}
        maxLength={200}
        disabled={saving}
        aria-label="Quest title"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        className="flex-1 min-w-0 text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 leading-tight bg-white/90 border border-optio-purple/40 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-optio-purple"
      />
      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="px-3 py-1.5 text-sm font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg disabled:opacity-60 flex-shrink-0"
      >
        {saving ? 'Saving...' : 'Save'}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={saving}
        className="px-2 py-1.5 text-sm text-gray-500 hover:text-gray-700 flex-shrink-0"
      >
        Cancel
      </button>
    </div>
  );
};

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
  const confirm = useConfirm()
  const navigate = useNavigate();
  const { user, effectiveRole } = useAuth();
  // A parent reaches this page only for a quest their school set for families
  // (routes/sis/staff_training.py, audience='family'). The student-only
  // surfaces it links out to are still closed to them, so the links would
  // bounce them silently to their own home — see App.jsx.
  const isParent = effectiveRole === 'parent';
  const [showJourney, setShowJourney] = useState(false);
  const [showRhythmModal, setShowRhythmModal] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);

  const descriptionText = stripHtml(quest?.big_idea || quest?.description);
  const isDescriptionLong = descriptionText.length > 140;

  // Fetch engagement/rhythm data for enrolled users
  const { data: engagement } = useQuestEngagement(
    quest?.user_enrollment ? quest.id : null
  );

  // Get quest header image
  const questImage = quest?.image_url || quest?.header_image_url || getQuestHeaderImageSync(quest?.quest_type);

  // Org-branded quests (e.g. Hearthwood Academy course quests) render the school's
  // logo as a contained banner behind the title — like the Spark branch below —
  // instead of cropping it full-bleed. Flagged by metadata.header_style.
  // When the quest also has a distinct cover photo (image_url), prefer that as a
  // full-bleed background here and let the logo live on the card instead (e.g.
  // POE: AGO logo on the card, hero photo on the quest page).
  const isOrgLogoBanner =
    quest?.metadata?.header_style === 'org_logo' && !!quest?.header_image_url &&
    !quest?.image_url && !imageError;

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
      stem: 'from-pillar-stem to-pillar-stem-dark',
      wellness: 'from-pillar-wellness to-pillar-wellness-dark',
      communication: 'from-pillar-communication to-pillar-communication-dark',
      civics: 'from-pillar-civics to-pillar-civics-dark',
      art: 'from-pillar-art to-pillar-art-dark'
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
    // Return to class page if navigated from there
    const classReturnPath = sessionStorage.getItem('classReturnPath');
    if (classReturnPath) {
      sessionStorage.removeItem('classReturnPath');
      navigate(classReturnPath);
      return;
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
        {isOrgLogoBanner ? (
          <div className="absolute inset-0 bg-white">
            {/* Pin the logo to a fixed-height region anchored at the top (matching
                the collapsed hero height) so it stays put when the hero grows —
                e.g. when "Show journey" expands the content below. */}
            <div className="absolute inset-x-0 top-0 h-[150px] sm:h-[175px] md:h-[200px] flex items-center justify-center">
              <img
                src={quest.header_image_url}
                alt={`${quest?.title || 'Course'} banner`}
                className="h-1/2 max-h-24 max-w-[40%] object-contain"
                onError={() => setImageError(true)}
              />
            </div>
          </div>
        ) : isSparkQuest ? (
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

        {/* Gradient overlay - fades from white on left to transparent on right.
            Skipped for the org-logo banner, which sits on a plain background and
            would otherwise wash out the centered logo. */}
        {!isOrgLogoBanner && (
          <div className="absolute inset-0 bg-gradient-to-r from-white via-white/95 to-transparent sm:via-white/90 sm:to-white/20" />
        )}

        {/* Content overlay */}
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          {/* Back button - absolute positioned. Hidden on a Treehouse kiosk
              (focus mode), where the big purple "← Back" from the layout is the
              single, child-friendly back control. */}
          {!isFocusMode() && (
            <button
              onClick={handleBackClick}
              className="absolute top-3 left-4 sm:left-6 lg:left-8 flex items-center gap-1.5 text-gray-700 hover:text-gray-900 transition-colors text-sm font-medium bg-white/90 backdrop-blur-sm px-3 py-2 rounded-full shadow-sm min-h-[44px] touch-manipulation"
            >
              <ArrowLeftIcon className="w-4 h-4" />
              <span>Back</span>
            </button>
          )}

          {/* Title and XP badge - pt-14 clears the absolute positioned back button */}
          <div className={`max-w-xl sm:max-w-2xl pb-2 ${isFocusMode() ? 'pt-2' : 'pt-14'}`}>
            {totalXP > 0 && (
              <div className="inline-block mb-1 px-2 py-0.5 bg-gradient-primary text-white rounded-full text-xs font-semibold shadow-sm">
                {totalXP} XP
              </div>
            )}
            {quest?.student_created && (
              <div className="inline-block mb-1 ml-1.5 px-2 py-0.5 bg-optio-purple/10 text-optio-purple rounded-full text-xs font-semibold">
                Student-created
              </div>
            )}

            <QuestTitle
              quest={quest}
              className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 leading-tight line-clamp-2"
            />

            {descriptionText && (
              <>
                <p
                  className={`text-xs sm:text-sm text-gray-700 mt-1 leading-relaxed ${descriptionExpanded ? '' : 'line-clamp-2'}`}
                >
                  {descriptionText}
                </p>
                {isDescriptionLong && (
                  <button
                    type="button"
                    onClick={() => setDescriptionExpanded((prev) => !prev)}
                    className="mt-1 text-xs font-semibold text-optio-purple hover:text-optio-pink transition-colors"
                  >
                    {descriptionExpanded ? 'Show less' : 'Show more'}
                  </button>
                )}
              </>
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
                <div className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-2">
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
        {(timeEstimate || intensity || locationDisplay) && (
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
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          {/* Curriculum Button */}
          {quest?.material_link ? (
            <a
              href={quest.material_link}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary min-h-[44px] touch-manipulation"
            >
              <ArrowTopRightOnSquareIcon className="w-4 h-4" />
              View Curriculum
            </a>
          ) : quest?.has_curriculum && isEnrolled && !isParent ? (
            <button
              onClick={() => navigate(`/quests/${quest.id}/curriculum`)}
              className="btn-primary min-h-[44px] touch-manipulation"
            >
              <AcademicCapIcon className="w-4 h-4" />
              View Curriculum
            </button>
          ) : null}

          {/* Edit Curriculum - for admins/advisors */}
          {quest?.has_curriculum && user && ['admin', 'superadmin', 'advisor', 'teacher'].includes(user.role) && (
            <button
              onClick={() => navigate(`/quests/${quest.id}/curriculum/edit`)}
              className="btn-secondary min-h-[44px] touch-manipulation"
            >
              <PencilSquareIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Edit Curriculum</span>
              <span className="sm:hidden">Edit</span>
            </button>
          )}

          {/* Mark Completed Button - LMS quests only */}
          {isEnrolled && !isQuestCompleted && quest?.lms_platform && (
            <button
              onClick={async () => {
                if (await confirm('Only mark this quest as completed if you are finished with the associated LMS class.\n\nIf you submit more evidence to this quest later, it will automatically be reactivated.')) {
                  onEndQuest();
                }
              }}
              disabled={endQuestMutation?.isPending}
              className="btn-primary min-h-[44px] touch-manipulation"
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
