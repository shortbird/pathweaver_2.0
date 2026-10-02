import React, { useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '../../services/api';
import { useQuestEngagement, useStudentQuestEngagement } from '../../hooks/api/useQuests';
import { useFamilyScope } from '../../contexts/FamilyScopeContext';
import { useAuth } from '../../contexts/AuthContext';
import { useConfirm } from '../../contexts/ConfirmContext';
import { SORTS, groupQuests, questIdOf, questTitle } from './snapshotQuestGroups';

// The school office: who may take a quest off a student's snapshot. Matches the
// backend's ADMIN_ROLES on DELETE /api/advisor/student-overview/:id/quests/:id.
const OFFICE_ROLES = ['org_admin', 'campus_coordinator', 'superadmin'];

// Simple engagement heatmap cell
const HeatmapCell = ({ intensity, date, activities, size = 'normal' }) => {
  const intensityClasses = {
    0: 'bg-gray-100',
    1: 'bg-optio-purple/10',
    2: 'bg-optio-purple/20',
    3: 'bg-optio-purple/30',
    4: 'bg-optio-purple/40'
  };

  const sizeClasses = {
    small: 'w-3 h-3',
    normal: 'w-4 h-4 sm:w-5 sm:h-5'
  };

  const activityLabels = {
    task_completed: 'Task completed',
    evidence_uploaded: 'Evidence uploaded',
    tutor_message_sent: 'Tutor message',
    quest_viewed: 'Quest viewed',
    task_viewed: 'Task viewed'
  };

  const activityList = activities?.map(a => activityLabels[a] || a).join(', ') || 'No activity';

  return (
    <div
      className={`${sizeClasses[size]} rounded-sm ${intensityClasses[intensity] || 'bg-gray-100'} cursor-default`}
      title={date ? `${date}: ${activityList}` : 'No data'}
    />
  );
};

// Rhythm state configuration
const rhythmConfig = {
  in_flow: { label: 'In Flow', bgClass: 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10', textClass: 'text-optio-purple' },
  building: { label: 'Building', bgClass: 'bg-blue-50', textClass: 'text-blue-700' },
  resting: { label: 'Resting', bgClass: 'bg-green-50', textClass: 'text-green-700' },
  fresh_return: { label: 'Welcome Back', bgClass: 'bg-amber-50', textClass: 'text-amber-700' },
  ready_to_begin: { label: 'Ready to Begin', bgClass: 'bg-gray-50', textClass: 'text-gray-600' },
  ready_when_you_are: { label: 'Ready to Begin', bgClass: 'bg-gray-50', textClass: 'text-gray-600' },
  finding_rhythm: { label: 'Finding Rhythm', bgClass: 'bg-blue-50', textClass: 'text-blue-700' }
};

// Mini heat map for 7-day activity
const MiniHeatMap = ({ days }) => {
  const today = new Date();
  const last7Days = [];

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayData = days?.find(d => d.date === dateStr);
    last7Days.push({
      date: dateStr,
      intensity: dayData?.intensity || 0
    });
  }

  const getIntensityClass = (intensity) => {
    switch (intensity) {
      case 0: return 'bg-gray-200';
      case 1: return 'bg-optio-purple/20';
      case 2: return 'bg-optio-purple/40';
      case 3: return 'bg-optio-purple';
      case 4: return 'bg-gradient-primary';
      default: return 'bg-gray-200';
    }
  };

  return (
    <div className="flex gap-0.5">
      {last7Days.map((day) => (
        <div
          key={day.date}
          className={`w-2.5 h-2.5 rounded-sm ${getIntensityClass(day.intensity)}`}
          title={day.date}
        />
      ))}
    </div>
  );
};

// Active quest card with engagement metrics
const ActiveQuestCard = ({
  quest,
  studentId,
  viewerMode = 'student',
  onRemove = null
}) => {
  const questData = quest.quests || quest;
  const questId = questData.id || quest.quest_id;
  const navigate = useNavigate();
  const { enterScope } = useFamilyScope();

  // Which engagement endpoint to ask depends on WHO is looking, not on whether
  // a studentId was passed — every caller passes one, including
  // StudentOverviewPage, which passes the viewer's own id. Reading `!!studentId`
  // as "parent view" sent students to the parent endpoint for themselves and
  // teachers to it for their students; /api/parent/:id/engagement verifies a
  // guardian or observer link, so both got a 403 and a permanently blank
  // "Ready to Begin" (Sentry OPTIO-WEB-6).
  //
  // Only a guardian or observer can read the child-scoped endpoint. A student
  // reads their own -- and in family scope "their own" IS the child's, because
  // useQuestEngagement carries the scope. A teacher has neither route to this
  // metric, so they ask for nothing rather than for the wrong person's activity.
  const readsChildEngagement = viewerMode === 'parent' || viewerMode === 'observer';
  const readsOwnEngagement = viewerMode === 'student';
  const { data: ownEngagement } = useQuestEngagement(questId, { enabled: readsOwnEngagement });
  const { data: childEngagement } = useStudentQuestEngagement(
    studentId, questId, { enabled: readsChildEngagement }
  );
  const engagement = readsChildEngagement ? childEngagement : ownEngagement;

  // Get rhythm state from quest-specific engagement data
  const rhythmState = engagement?.rhythm?.state || 'ready_to_begin';
  const config = rhythmConfig[rhythmState] || rhythmConfig.finding_rhythm;

  // WHERE the card points depends on who is looking, not on whether a
  // studentId was passed -- every caller passes one, including the student's
  // own overview page, which passes the viewer's own id (Sentry OPTIO-WEB-1B:
  // an org admin at Arete sent to a parent-only page from her own overview).
  //
  // A student: their own quest page. A parent looking at a child: the same
  // quest page, in family scope (contexts/FamilyScopeContext) -- entering
  // scope first is what points the page at the child. This replaced the
  // act-as token swap for dependents and the thinner ParentQuestView for
  // linked students (2026-09-15). Staff and observers: no link. There is no
  // per-quest page for either, and a card that navigates to a refusal is
  // worse than a card that does not navigate.
  const isStaffViewer = viewerMode === 'advisor' || viewerMode === 'observer';
  const questLink = `/quests/${questId}`;

  const handleParentQuestClick = (e) => {
    e.preventDefault();
    enterScope(studentId);
    navigate(questLink);
  };

  const cardContent = (
    <>
      {/* Title */}
      <h4 className="font-semibold text-gray-900 text-sm sm:text-base mb-3 line-clamp-2 hover:text-optio-purple transition-colors">
        {questData.title}
      </h4>

      {/* Rhythm indicator with mini heat map */}
      <div className={`flex items-center justify-between px-2 py-1.5 rounded-md ${config.bgClass}`}>
        <span className={`text-xs font-medium ${config.textClass}`}>
          {config.label}
        </span>
        <MiniHeatMap days={engagement?.calendar?.days || []} />
      </div>
    </>
  );

  // A parent looking at a child's overview: open the quest in family scope.
  if (viewerMode === 'parent' && studentId) {
    return (
      <button
        onClick={handleParentQuestClick}
        className="block w-full text-left p-4 bg-white border border-gray-200 hover:border-optio-purple/30 hover:shadow-md rounded-xl transition-all"
      >
        {cardContent}
      </button>
    );
  }

  // Staff or observers looking at somebody else's overview: show the card,
  // don't pretend it opens. See the questLink note above.
  if (isStaffViewer && studentId) {
    return (
      <div className="block p-4 bg-white border border-gray-200 rounded-xl">
        {cardContent}
        {onRemove && (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={() => onRemove(quest)}
              className="text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
              aria-label={`Remove ${questData.title}`}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    );
  }

  // Linked students / own quests: regular link
  return (
    <Link
      to={questLink}
      className="block p-4 bg-white border border-gray-200 hover:border-optio-purple/30 hover:shadow-md rounded-xl transition-all"
    >
      {cardContent}
    </Link>
  );
};

// Recent completion item
const RecentCompletionItem = ({ completion }) => {
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex items-center gap-3 py-2">
      <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 truncate">
          {completion.task_title || completion.title || 'Task completed'}
        </p>
        <p className="text-xs text-gray-500">
          {completion.xp_awarded || 0} XP - {formatDate(completion.completed_at)}
        </p>
      </div>
    </div>
  );
};

// Full engagement calendar (GitHub-style)
const EngagementCalendar = ({ calendarData }) => {
  // Group by weeks for display
  const { weeks, monthLabels } = useMemo(() => {
    if (!calendarData || calendarData.length === 0) return { weeks: [], monthLabels: [] };

    const weeksArray = [];
    let currentWeek = [];
    const months = [];
    let lastMonth = null;

    calendarData.forEach((day, idx) => {
      const date = new Date(day.date);
      const dayOfWeek = date.getDay();
      const month = date.getMonth();

      // Track month changes for labels
      if (month !== lastMonth) {
        months.push({
          weekIndex: weeksArray.length,
          label: date.toLocaleDateString('en-US', { month: 'short' })
        });
        lastMonth = month;
      }

      // Start a new week on Sunday
      if (dayOfWeek === 0 && currentWeek.length > 0) {
        weeksArray.push(currentWeek);
        currentWeek = [];
      }

      currentWeek.push(day);
    });

    // Push the last week
    if (currentWeek.length > 0) {
      weeksArray.push(currentWeek);
    }

    return { weeks: weeksArray, monthLabels: months };
  }, [calendarData]);

  if (weeks.length === 0) {
    return (
      <div className="text-center py-4 text-gray-500 text-sm">
        No activity data yet. Complete some tasks to see your engagement calendar.
      </div>
    );
  }

  return (
    <div className="pb-2">
      {/* Month labels - only show distinct months */}
      <div className="flex gap-1 mb-1 text-xs text-gray-400">
        {monthLabels.map((m, idx) => (
          <span key={idx} className="mr-2">{m.label}</span>
        ))}
      </div>
      {/* Calendar grid - dates next to each other */}
      <div className="flex gap-1 flex-wrap">
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="flex flex-col gap-1">
            {week.map((day, dayIdx) => (
              <HeatmapCell
                key={day.date}
                intensity={day.intensity}
                date={day.date}
                activities={day.activities}
                size="normal"
              />
            ))}
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-4 text-xs text-gray-500">
        <span>Less</span>
        <div className="flex gap-1">
          {[0, 1, 2, 3, 4].map(level => (
            <HeatmapCell key={level} intensity={level} size="small" />
          ))}
        </div>
        <span>More</span>
      </div>
    </div>
  );
};

const LearningSnapshot = ({
  engagementData = {},
  activeQuests = [],
  recentCompletions = [],
  hideHeader = false,
  studentId = null, // whose overview this is (the viewer's own id on StudentOverviewPage)
  studentName = null, // first name for the empty state when looking at someone else
  // Who is looking: 'student' (their own overview), 'parent', 'observer', or
  // 'advisor'. Decides which engagement endpoint the quest cards may call —
  // studentId cannot, because every caller passes one.
  viewerMode = 'student'
}) => {
  const { calendar = [], rhythm, summary } = engagementData;
  const { user, effectiveRoles = [] } = useAuth();
  const confirm = useConfirm();
  // StudentOverviewPage passes the student's own id as studentId, so studentId
  // alone doesn't mean "viewing someone else" — compare against the viewer.
  const viewingOwnData = !studentId || user?.id === studentId;

  // Grouped by the class each quest came through, sorted inside each group
  // (iCreate, 2026-10-01, d8a2a8d4: "categorized and sortable").
  const [sortBy, setSortBy] = useState('recent');
  // Quests the office took off while this page was open. The list comes from
  // the parent's fetch, so the snapshot hides them itself until the next load.
  const [removed, setRemoved] = useState(() => new Set());
  const shown = useMemo(
    () => activeQuests.filter((q) => !removed.has(questIdOf(q))),
    [activeQuests, removed]
  );
  const groups = useMemo(() => groupQuests(shown, sortBy), [shown, sortBy]);

  // The office's Remove: only on a student's overview, never on your own.
  const canRemove = viewerMode === 'advisor' && !viewingOwnData
    && OFFICE_ROLES.some((r) => (effectiveRoles || []).includes(r));

  const removeQuest = async (quest) => {
    const questId = questIdOf(quest);
    const title = questTitle(quest) || 'this quest';
    const who = studentName || 'this student';
    if (!(await confirm(
      `Remove "${title}" from ${who}'s account?\n\n`
      + 'If they have not started it, it is removed. If they have done any of it, it moves off '
      + 'their active list and stays in their portfolio. Completed tasks and the XP they earned are kept.'
    ))) return;
    try {
      const { data } = await api.delete(`/api/advisor/student-overview/${studentId}/quests/${questId}`);
      setRemoved((prev) => new Set(prev).add(questId));
      const still = (data?.still_on_classes || []).map((c) => c.name).filter(Boolean);
      toast.success(still.length
        ? `Removed. It is still on ${still.join(', ')}; take it off there for them on the class's Quests tab.`
        : 'Removed');
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the quest');
    }
  };

  const emptyState = (
    <div className="text-center py-8 bg-gray-50 rounded-xl">
      <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
      <p className="text-gray-500 mb-3">No active quests</p>
      {/* /quests is a student surface; parents/advisors viewing a child
          get a descriptive line instead of a link they can't follow. */}
      {viewingOwnData ? (
        <Link
          to="/quests"
          className="btn-primary"
        >
          Discover Quests
        </Link>
      ) : (
        <p className="text-sm text-gray-400">
          Quests will appear here once {studentName || 'this student'} starts working on one.
        </p>
      )}
    </div>
  );

  const content = (
    <div className="space-y-6">
      {/* Calendar */}
      <div>
        <div className="flex items-center gap-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
            Activity Calendar
          </h3>
          {summary && (
            <span className="text-xs text-gray-500">
              {summary.active_days_last_month || 0} active days this month
            </span>
          )}
        </div>
        <EngagementCalendar calendarData={calendar} />
      </div>

      {/* Active quests, by class */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider">
            Active Quests
          </h3>
          {shown.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-gray-500">
              Sort by
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm border border-gray-300 rounded-lg px-2 py-1 bg-white text-gray-700"
              >
                {SORTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </label>
          )}
        </div>
        {shown.length === 0 ? emptyState : groups.map((g) => (
          <section key={g.key} aria-label={g.label}>
            <h4 className="text-sm font-semibold text-gray-800 mb-2">
              {g.label}
              <span className="ml-2 text-xs font-normal text-gray-500">
                {g.quests.length} quest{g.quests.length === 1 ? '' : 's'}
                {g.former ? ' · no longer in this class' : ''}
              </span>
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {g.quests.map((quest, idx) => (
                <ActiveQuestCard
                  key={questIdOf(quest) || `${g.key}-${idx}`}
                  quest={quest}
                  studentId={studentId}
                  viewerMode={viewerMode}
                  onRemove={canRemove ? removeQuest : null}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {/* Recent Completions */}
      {recentCompletions.length > 0 && (
        <div className="clear-both pt-2">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-3">
            Recent Activity
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
            {recentCompletions.slice(0, 6).map((completion, idx) => (
              <RecentCompletionItem key={completion.id || idx} completion={completion} />
            ))}
          </div>
        </div>
      )}
    </div>
  );

  if (hideHeader) {
    return content;
  }

  return (
    <section className="bg-white rounded-2xl shadow-lg p-6">
      <div className="flex items-center gap-2 mb-6">
        <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <h2 className="text-xl font-bold text-gray-900">
          Learning Snapshot
        </h2>
        {rhythm && (
          <span className="ml-2 px-2 py-0.5 bg-optio-purple/10 text-optio-purple-dark rounded-full text-xs font-medium">
            {rhythm.state_display}
          </span>
        )}
      </div>
      {content}
    </section>
  );
};

LearningSnapshot.propTypes = {
  engagementData: PropTypes.shape({
    calendar: PropTypes.arrayOf(PropTypes.shape({
      date: PropTypes.string,
      intensity: PropTypes.number,
      activity_count: PropTypes.number,
      activities: PropTypes.array
    })),
    rhythm: PropTypes.shape({
      state: PropTypes.string,
      state_display: PropTypes.string,
      message: PropTypes.string
    }),
    summary: PropTypes.shape({
      active_days_last_week: PropTypes.number,
      active_days_last_month: PropTypes.number,
      last_activity_date: PropTypes.string,
      total_activities: PropTypes.number
    })
  }),
  activeQuests: PropTypes.array,
  recentCompletions: PropTypes.array,
  studentId: PropTypes.string,
  viewerMode: PropTypes.oneOf(['student', 'parent', 'observer', 'advisor'])
};

export default LearningSnapshot;
