import React, { useMemo } from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { useQuestEngagement } from '../../hooks/api/useQuests';

// Simple engagement heatmap cell
const HeatmapCell = ({ intensity, date, activities, size = 'normal' }) => {
  const intensityClasses = {
    0: 'bg-gray-100',
    1: 'bg-purple-100',
    2: 'bg-purple-200',
    3: 'bg-purple-300',
    4: 'bg-purple-400'
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
      case 1: return 'bg-purple-200';
      case 2: return 'bg-purple-400';
      case 3: return 'bg-purple-600';
      case 4: return 'bg-gradient-to-r from-optio-purple to-optio-pink';
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
const ActiveQuestCard = ({ quest, studentId }) => {
  const questData = quest.quests || quest;
  const questId = questData.id || quest.quest_id;

  // Fetch quest-specific engagement data
  const { data: engagement } = useQuestEngagement(questId);

  // Get rhythm state from quest-specific engagement data
  const rhythmState = engagement?.rhythm?.state || 'ready_to_begin';
  const config = rhythmConfig[rhythmState] || rhythmConfig.finding_rhythm;

  // Use parent route if studentId is provided
  const questLink = studentId
    ? `/parent/quest/${studentId}/${questId}`
    : `/quests/${questId}`;

  return (
    <Link
      to={questLink}
      className="block p-4 bg-white border border-gray-200 hover:border-purple-300 hover:shadow-md rounded-xl transition-all"
    >
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
  studentId = null // For parent view - prefixes quest links with /parent/quest/{studentId}/
}) => {
  const { calendar = [], rhythm, summary } = engagementData;

  const content = (
    <div className="space-y-6">
      {/* Headers row - matches grid below */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider hidden md:block">
          Active Quests
        </h3>
        <div className="flex items-center gap-4">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider hidden md:block">
            Activity Calendar
          </h3>
          {summary && (
            <span className="text-xs text-gray-500 hidden md:inline">
              {summary.active_days_last_month || 0} active days this month
            </span>
          )}
        </div>
      </div>

      {/* Content: Stacked on mobile, 2-column on md+ */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* First 2 quests */}
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider md:hidden">
            Active Quests
          </h3>
          {activeQuests.length > 0 ? (
            activeQuests.slice(0, 2).map((quest, idx) => (
              <ActiveQuestCard
                key={quest.quests?.id || idx}
                quest={quest}
                studentId={studentId}
              />
            ))
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-xl">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-gray-500 mb-3">No active quests</p>
              <Link
                to="/quests"
                className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-medium text-sm hover:shadow-md transition-shadow"
              >
                Discover Quests
              </Link>
            </div>
          )}
        </div>

        {/* Calendar */}
        <div className="self-start">
          <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wider md:hidden mb-4">
            Activity Calendar
            {summary && (
              <span className="text-xs text-gray-500 ml-2">
                {summary.active_days_last_month || 0} active days this month
              </span>
            )}
          </h3>
          <EngagementCalendar calendarData={calendar} />
        </div>

        {/* Remaining quests */}
        {activeQuests.length > 2 && (
          <div className="col-span-1 md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeQuests.slice(2).map((quest, idx) => (
              <ActiveQuestCard
                key={quest.quests?.id || `extra-${idx}`}
                quest={quest}
                studentId={studentId}
              />
            ))}
          </div>
        )}
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
        <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
          Learning Snapshot
        </h2>
        {rhythm && (
          <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full text-xs font-medium">
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
  studentId: PropTypes.string
};

export default LearningSnapshot;
