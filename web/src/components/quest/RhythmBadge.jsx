import React from 'react';
import {
  BoltIcon,
  ArrowTrendingUpIcon,
  MoonIcon,
  ArrowPathIcon,
  PlayCircleIcon
} from '@heroicons/react/24/solid';

/**
 * The rhythm badge: a quest's engagement state ("In Flow", "Resting", ...)
 * with a seven-day mini heat map. The process-focused metric the platform
 * shows instead of a progress bar (core_philosophy.md).
 *
 * `rhythmConfig` and `MiniHeatMap` grew up inside QuestCardSimple; they were
 * lifted here on 2026-09-15 when the family dashboard needed the same badge
 * on a child's quests and on a family quest's members, so the three places
 * share one recipe. `days` is `[{ date: 'YYYY-MM-DD', intensity: 0-4 }]`,
 * either the full calendar from /engagement or the seven-day slice the
 * family reads carry as `rhythm.last_7_days`.
 */

export const rhythmConfig = {
  in_flow: {
    icon: BoltIcon,
    bgClass: 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10',
    textClass: 'text-optio-purple'
  },
  building: {
    icon: ArrowTrendingUpIcon,
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700'
  },
  resting: {
    icon: MoonIcon,
    bgClass: 'bg-green-50',
    textClass: 'text-green-700'
  },
  fresh_return: {
    icon: ArrowPathIcon,
    bgClass: 'bg-amber-50',
    textClass: 'text-amber-700'
  },
  ready_to_begin: {
    icon: PlayCircleIcon,
    bgClass: 'bg-gray-50',
    textClass: 'text-gray-600'
  },
  ready_when_you_are: {
    icon: PlayCircleIcon,
    bgClass: 'bg-gray-50',
    textClass: 'text-gray-600'
  },
  finding_rhythm: {
    icon: ArrowTrendingUpIcon,
    bgClass: 'bg-blue-50',
    textClass: 'text-blue-700'
  }
};

export const MiniHeatMap = ({ days }) => {
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
      case 2: return 'bg-optio-purple-light';
      case 3: return 'bg-optio-purple';
      case 4: return 'bg-gradient-primary';
      default: return 'bg-gray-200';
    }
  };

  return (
    <div className="flex gap-1">
      {last7Days.map((day) => (
        <div
          key={day.date}
          className={`w-3 h-3 rounded-sm ${getIntensityClass(day.intensity)}`}
          title={day.date}
        />
      ))}
    </div>
  );
};


/**
 * rhythm: { state, state_display } from any engagement payload.
 * days: the calendar days (any range); the map shows the last seven.
 * size 'sm' is the compact row the family dashboard uses.
 * label false drops the state text: icon and heat map only, for a row too
 * narrow to fit "Building Momentum" (a family quest's member rows). The
 * state still reads on hover, as the title.
 */
export default function RhythmBadge({ rhythm, days, size = 'md', label = true, className = '' }) {
  const state = rhythm?.state || 'ready_to_begin';
  const config = rhythmConfig[state] || rhythmConfig.finding_rhythm;
  const Icon = config.icon;
  const compact = size === 'sm';
  const display = rhythm?.state_display || 'Ready to Begin';
  return (
    <div
      className={`flex items-center ${label ? 'justify-between' : 'justify-start'} gap-2 rounded-lg ${config.bgClass} ${compact ? 'px-2 py-1' : 'px-3 py-2'} ${className}`}
      title={label ? undefined : display}
    >
      <div className="flex items-center gap-1.5 min-w-0">
        <Icon className={`${compact ? 'w-3.5 h-3.5' : 'w-5 h-5'} flex-shrink-0 ${config.textClass}`} aria-label={label ? undefined : display} />
        {label && (
          <span className={`${compact ? 'text-xs' : 'text-sm'} font-semibold truncate ${config.textClass}`}>
            {display}
          </span>
        )}
      </div>
      <MiniHeatMap days={days} />
    </div>
  );
}
