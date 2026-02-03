import React, { useMemo, useState, useRef, useEffect } from 'react';

/**
 * EngagementCalendar - Activity timeline with date markers
 *
 * Adaptive sizing: starts small for new quests, grows with engagement.
 * Shows clear date range so users understand what they're looking at.
 */
const EngagementCalendar = ({ days = [], weeksActive = 1, firstActivityDate }) => {
  const [hoveredDay, setHoveredDay] = useState(null);
  const [tooltipPosition, setTooltipPosition] = useState('top');
  const containerRef = useRef(null);
  const hoveredRef = useRef(null);

  // Intensity to color class mapping (using optio brand colors)
  const intensityColors = {
    0: 'bg-gray-100',
    1: 'bg-purple-200',
    2: 'bg-purple-400',
    3: 'bg-purple-600',
    4: 'bg-gradient-to-br from-optio-purple to-optio-pink'
  };

  // Calculate tooltip position to avoid edge cutoff
  useEffect(() => {
    if (hoveredDay && hoveredRef.current && containerRef.current) {
      const dayRect = hoveredRef.current.getBoundingClientRect();
      const containerRect = containerRef.current.getBoundingClientRect();

      // Check if near top (not enough space for tooltip above)
      const isNearTop = dayRect.top - containerRect.top < 60;

      // Check horizontal position
      const isNearLeft = dayRect.left - containerRect.left < 80;
      const isNearRight = containerRect.right - dayRect.right < 80;

      // Determine position: bottom if near top, otherwise top
      const vertical = isNearTop ? 'bottom' : 'top';

      if (isNearLeft) {
        setTooltipPosition(`${vertical}-left`);
      } else if (isNearRight) {
        setTooltipPosition(`${vertical}-right`);
      } else {
        setTooltipPosition(vertical);
      }
    }
  }, [hoveredDay]);

  // Format date for display
  const formatDateShort = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDateFull = (dateStr) => {
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
  };

  // Format activities for tooltip
  const formatActivities = (activities) => {
    if (!activities || activities.length === 0) return 'No activity';

    const labels = {
      task_completed: 'Task completed',
      evidence_uploaded: 'Evidence added',
      task_viewed: 'Task viewed',
      tutor_message_sent: 'Tutor chat',
      quest_viewed: 'Quest viewed'
    };

    return activities
      .map(a => labels[a] || a)
      .join(', ');
  };

  // Calculate date range info
  const dateInfo = useMemo(() => {
    if (!days || days.length === 0) return null;

    const startDate = days[0].date;
    const endDate = days[days.length - 1].date;
    const totalDays = days.length;
    const activeDays = days.filter(d => d.activity_count > 0).length;

    return { startDate, endDate, totalDays, activeDays };
  }, [days]);

  // Get tooltip position classes
  const getTooltipClasses = () => {
    const base = 'absolute px-2 py-1.5 bg-gray-900 text-white text-xs rounded-lg shadow-lg whitespace-nowrap z-50 pointer-events-none';

    switch (tooltipPosition) {
      case 'top-left':
        return `${base} bottom-full mb-2 left-0`;
      case 'top-right':
        return `${base} bottom-full mb-2 right-0`;
      case 'top':
        return `${base} bottom-full mb-2 left-1/2 -translate-x-1/2`;
      case 'bottom-left':
        return `${base} top-full mt-2 left-0`;
      case 'bottom-right':
        return `${base} top-full mt-2 right-0`;
      case 'bottom':
        return `${base} top-full mt-2 left-1/2 -translate-x-1/2`;
      default:
        return `${base} bottom-full mb-2 left-1/2 -translate-x-1/2`;
    }
  };

  const getArrowClasses = () => {
    const isBottom = tooltipPosition.startsWith('bottom');

    if (isBottom) {
      // Arrow points up (tooltip is below)
      const base = 'absolute bottom-full -mb-px';
      switch (tooltipPosition) {
        case 'bottom-left':
          return `${base} left-3`;
        case 'bottom-right':
          return `${base} right-3`;
        default:
          return `${base} left-1/2 -translate-x-1/2`;
      }
    } else {
      // Arrow points down (tooltip is above)
      const base = 'absolute top-full -mt-px';
      switch (tooltipPosition) {
        case 'top-left':
          return `${base} left-3`;
        case 'top-right':
          return `${base} right-3`;
        default:
          return `${base} left-1/2 -translate-x-1/2`;
      }
    }
  };

  const getArrowBorderClasses = () => {
    const isBottom = tooltipPosition.startsWith('bottom');
    return isBottom
      ? 'border-4 border-transparent border-b-gray-900'
      : 'border-4 border-transparent border-t-gray-900';
  };

  // No data yet
  if (!days || days.length === 0) {
    return (
      <div className="bg-white rounded-lg p-4 border border-gray-200 shadow-sm">
        <p className="text-sm text-gray-600" style={{ fontFamily: 'Poppins' }}>
          Your journey calendar will appear here as you engage with learning.
          Each day you complete tasks, add evidence, or explore, a square lights up.
        </p>
      </div>
    );
  }

  // Day 1 - only one day of activity, show explanation instead of single square
  const activeDaysCount = days.filter(d => d.activity_count > 0).length;
  if (days.length <= 1 || activeDaysCount <= 1) {
    return (
      <div className="bg-white rounded-lg p-4 border border-purple-200 shadow-sm">
        <p className="text-sm text-gray-700 mb-2" style={{ fontFamily: 'Poppins' }}>
          <span className="font-medium text-optio-purple">You're getting started!</span>
        </p>
        <p className="text-xs text-gray-500" style={{ fontFamily: 'Poppins' }}>
          Your journey calendar tracks your learning rhythm over time. As you engage
          each day, squares light up to show your pattern. Check back in a few days
          to see your rhythm develop.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 overflow-visible" ref={containerRef}>
      {/* Date range header */}
      <div className="flex items-center justify-between text-xs text-gray-500" style={{ fontFamily: 'Poppins' }}>
        <span>
          {dateInfo && `${formatDateShort(dateInfo.startDate)} - ${formatDateShort(dateInfo.endDate)}`}
        </span>
        <span className="text-gray-400">
          {dateInfo?.activeDays} active {dateInfo?.activeDays === 1 ? 'day' : 'days'}
        </span>
      </div>

      {/* Activity grid */}
      <div className="overflow-visible pb-1 -mx-1 px-1">
        <div className="flex gap-1 flex-wrap" style={{ maxWidth: '100%' }}>
          {days.map((day, index) => (
            <div
              key={day.date}
              className="relative group"
              ref={hoveredDay?.date === day.date ? hoveredRef : null}
              onMouseEnter={() => setHoveredDay(day)}
              onMouseLeave={() => setHoveredDay(null)}
            >
              <div
                className={`w-5 h-5 sm:w-6 sm:h-6 rounded-sm ${intensityColors[day.intensity]} transition-all hover:ring-2 hover:ring-optio-purple/50 cursor-pointer`}
                aria-label={`${formatDateFull(day.date)}: ${day.activity_count} activities`}
              />
              {/* Smart-positioned Tooltip */}
              {hoveredDay?.date === day.date && (
                <div className={getTooltipClasses()}>
                  <div className="font-medium">{formatDateFull(day.date)}</div>
                  <div className="text-gray-300">
                    {day.activity_count === 0 ? 'No activity' : `${day.activity_count} ${day.activity_count === 1 ? 'activity' : 'activities'}`}
                  </div>
                  {day.activities?.length > 0 && (
                    <div className="text-gray-400 text-[10px] mt-0.5">
                      {formatActivities(day.activities)}
                    </div>
                  )}
                  {/* Arrow */}
                  <div className={getArrowClasses()}>
                    <div className={getArrowBorderClasses()} />
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs text-gray-400">
          <span>Less</span>
          <div className="flex gap-0.5">
            {[0, 1, 2, 3, 4].map(i => (
              <div key={i} className={`w-3.5 h-3.5 rounded-sm ${intensityColors[i]}`} />
            ))}
          </div>
          <span>More</span>
        </div>
      </div>
    </div>
  );
};

export default EngagementCalendar;
