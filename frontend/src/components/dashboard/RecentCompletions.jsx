import React from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircleIcon,
  TrophyIcon,
  ClockIcon
} from '@heroicons/react/24/outline';
import { getPillarData } from '../../utils/pillarMappings';
import { useAuth } from '../../contexts/AuthContext';

const RecentCompletions = ({ recentItems }) => {
  const { user } = useAuth();
  if (!recentItems || recentItems.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-500 rounded-lg flex items-center justify-center">
            <CheckCircleIcon className="w-5 h-5 text-white" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Recent Completions</h2>
        </div>

        <div className="text-center py-8">
          <CheckCircleIcon className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-600">No recent completions yet.</p>
          <p className="text-sm text-gray-500 mt-1">Complete tasks or quests to see them here!</p>
        </div>
      </div>
    );
  }

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'Recently';
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now - time) / (1000 * 60 * 60));

    if (diffInHours < 1) return 'Just now';
    if (diffInHours < 24) return `${diffInHours}h ago`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `${diffInDays}d ago`;
  };

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 bg-gradient-to-r from-emerald-500 to-green-500 rounded-lg flex items-center justify-center">
          <CheckCircleIcon className="w-5 h-5 text-white" />
        </div>
        <h2 className="text-xl font-bold text-gray-900">Recent Completions</h2>
      </div>

      <div className="space-y-3">
        {recentItems.map((item, idx) => {
          const isTask = item.type === 'task';
          const pillarData = isTask && item.pillar ? getPillarData(item.pillar) : null;

          return (
            <div
              key={item.id || idx}
              className={`p-4 rounded-lg transition-all duration-200 ${
                isTask
                  ? 'bg-gradient-to-r from-gray-50 to-white border border-gray-200 hover:shadow-md'
                  : 'bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-200 hover:shadow-lg hover:border-purple-300'
              }`}
            >
              <div className="flex items-start gap-4">
                {/* Icon */}
                <div className={`rounded-lg flex items-center justify-center flex-shrink-0 ${
                  isTask
                    ? `w-10 h-10 ${pillarData ? `${pillarData.bg} ${pillarData.text}` : 'bg-blue-100 text-blue-600'}`
                    : 'w-12 h-12 bg-gradient-to-br from-purple-500 to-pink-500 text-white shadow-lg'
                }`}>
                  {isTask ? (
                    <CheckCircleIcon className="w-5 h-5" />
                  ) : (
                    <TrophyIcon className="w-6 h-6" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className={`truncate ${
                        isTask
                          ? 'text-sm font-semibold text-gray-900'
                          : 'text-base font-bold text-purple-900'
                      }`}>
                        {item.title}
                      </h3>

                      {/* Task shows quest name, Quest shows completion message */}
                      {isTask && item.quest_title && (
                        <p className="text-xs text-gray-600 mt-1">
                          Quest: <span className="font-medium">{item.quest_title}</span>
                        </p>
                      )}

                      {!isTask && (
                        <p className="text-sm text-purple-700 mt-1 font-medium">
                          Quest Completed!
                        </p>
                      )}

                      {/* Type and Pillar badges */}
                      <div className="flex items-center flex-wrap gap-2 mt-2">
                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${
                          isTask
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-purple-100 text-purple-800 border-purple-300 font-semibold'
                        }`}>
                          {isTask ? 'Task' : 'Quest Complete'}
                        </span>

                        {/* Pillar badge for tasks */}
                        {isTask && pillarData && (
                          <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${pillarData.bg} ${pillarData.text} ${pillarData.bg.replace('bg-', 'border-').replace('100', '200')}`}>
                            {pillarData.name}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* XP and time */}
                    <div className="text-right flex-shrink-0 ml-4">
                      <div className={`font-bold ${
                        isTask
                          ? 'text-lg text-emerald-600'
                          : 'text-xl text-purple-600'
                      }`}>
                        +{item.xp || item.xp_awarded || 0} XP
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                        <ClockIcon className="w-3 h-3" />
                        <span>{formatTimeAgo(item.completed_at)}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* View more link */}
      {recentItems.length >= 5 && user?.id && (
        <div className="mt-6 text-center">
          <Link
            to="/diploma"
            className="text-sm text-purple-600 hover:text-purple-800 font-medium transition-colors"
          >
            view all completions on diploma →
          </Link>
        </div>
      )}
    </div>
  );
};

export default RecentCompletions;