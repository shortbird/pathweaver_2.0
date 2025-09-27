import React from 'react';
import {
  FireIcon,
  CalendarDaysIcon,
  TrophyIcon,
  ChartBarIcon,
  StarIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

const StatsCard = ({ stats }) => {
  const statItems = [
    {
      icon: ChartBarIcon,
      label: 'Total XP',
      value: stats?.total_xp || 0,
      color: 'bg-purple-50 text-purple-600',
      bgColor: 'bg-purple-100'
    },
    {
      icon: TrophyIcon,
      label: 'Quests Completed',
      value: stats?.quests_completed || 0,
      color: 'bg-emerald-50 text-emerald-600',
      bgColor: 'bg-emerald-100'
    },
    {
      icon: StarIcon,
      label: 'Tasks Completed',
      value: stats?.tasks_completed || 0,
      color: 'bg-blue-50 text-blue-600',
      bgColor: 'bg-blue-100'
    },
    {
      icon: FireIcon,
      label: 'Current Task Streak',
      value: stats?.task_streak_current || 0,
      color: 'bg-orange-50 text-orange-600',
      bgColor: 'bg-orange-100',
      suffix: stats?.task_streak_current === 1 ? ' day' : ' days'
    },
    {
      icon: CalendarDaysIcon,
      label: 'Best Task Streak',
      value: stats?.task_streak_best || 0,
      color: 'bg-pink-50 text-pink-600',
      bgColor: 'bg-pink-100',
      suffix: stats?.task_streak_best === 1 ? ' day' : ' days'
    },
    {
      icon: ClockIcon,
      label: 'Weekly Active Days',
      value: stats?.weekly_active_days || 0,
      color: 'bg-indigo-50 text-indigo-600',
      bgColor: 'bg-indigo-100',
      suffix: '/7 days'
    }
  ];

  const additionalStats = [
    {
      label: 'Favorite Learning Area',
      value: stats?.favorite_pillar || 'None yet',
      icon: '🎯'
    },
    {
      label: 'Avg XP per Day',
      value: `${stats?.avg_xp_per_day || 0} XP`,
      icon: '📊'
    },
    {
      label: 'Most Productive Day',
      value: stats?.most_productive_day || 'Not enough data',
      icon: '📅'
    }
  ];

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 bg-gradient-to-r from-[#ef597b] to-[#6d469b] rounded-lg flex items-center justify-center">
          <ChartBarIcon className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Your Stats</h2>
      </div>

      {/* Main Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
        {statItems.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div key={index} className={`${stat.color} rounded-lg p-4 border border-gray-200`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 ${stat.bgColor} rounded-lg flex-shrink-0`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xl font-bold">
                    {stat.value}{stat.suffix || ''}
                  </div>
                  <div className="text-sm opacity-75 leading-tight">{stat.label}</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Additional Stats */}
      <div className="border-t border-gray-200 pt-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Learning Insights</h3>
        <div className="space-y-3">
          {additionalStats.map((stat, index) => (
            <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <span className="text-lg flex-shrink-0">{stat.icon}</span>
                <span className="text-sm font-medium text-gray-700 truncate">{stat.label}</span>
              </div>
              <span className="text-sm font-semibold text-gray-900 ml-3 flex-shrink-0">{stat.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Streak Progress */}
      {stats?.task_streak_current > 0 && (
        <div className="mt-6 p-4 bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg">
          <div className="flex items-center gap-2 mb-2">
            <FireIcon className="w-5 h-5 text-orange-500" />
            <span className="font-semibold text-orange-900">Keep the streak alive!</span>
          </div>
          <p className="text-sm text-orange-700">
            You're on a {stats.task_streak_current}-day streak.
            {stats.task_streak_current < stats.task_streak_best
              ? ` Your best is ${stats.task_streak_best} days!`
              : ' This is your personal best!'}
          </p>
        </div>
      )}
    </div>
  );
};

export default StatsCard;