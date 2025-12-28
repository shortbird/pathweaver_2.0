import { formatDistanceToNow } from 'date-fns';
import { CheckCircleIcon, SparklesIcon, TrophyIcon } from '@heroicons/react/24/solid';

const getActivityIcon = (activityType) => {
  switch (activityType) {
    case 'quest_completed':
      return <TrophyIcon className="h-5 w-5 text-yellow-500" />;
    case 'task_completed':
      return <CheckCircleIcon className="h-5 w-5 text-green-500" />;
    case 'badge_earned':
      return <SparklesIcon className="h-5 w-5 text-optio-purple" />;
    default:
      return <CheckCircleIcon className="h-5 w-5 text-gray-500" />;
  }
};

const getActivityColor = (activityType) => {
  switch (activityType) {
    case 'quest_completed':
      return 'border-yellow-200 bg-yellow-50';
    case 'task_completed':
      return 'border-green-200 bg-green-50';
    case 'badge_earned':
      return 'border-purple-200 bg-purple-50';
    default:
      return 'border-gray-200 bg-gray-50';
  }
};

export default function ActivityTimeline({ activities = [] }) {
  if (activities.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-md p-6 text-center">
        <p className="text-gray-500">No recent activity to display</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h3 className="text-xl font-bold text-gray-800 mb-4">Recent Activity</h3>

      <div className="space-y-4">
        {activities.map((activity, index) => (
          <div
            key={activity.id || index}
            className={`flex items-start space-x-4 p-4 rounded-lg border ${getActivityColor(
              activity.type
            )}`}
          >
            {/* Icon */}
            <div className="flex-shrink-0 mt-1">{getActivityIcon(activity.type)}</div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900">{activity.title}</p>
              {activity.description && (
                <p className="text-sm text-gray-600 mt-1">{activity.description}</p>
              )}
              <div className="flex items-center mt-2 space-x-4">
                <p className="text-xs text-gray-500">
                  {formatDistanceToNow(new Date(activity.timestamp), { addSuffix: true })}
                </p>
                {activity.xp_earned && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gradient-to-r from-optio-purple to-optio-pink text-white">
                    +{activity.xp_earned} XP
                  </span>
                )}
              </div>
            </div>

            {/* Collaborators (if any) */}
            {activity.collaborators && activity.collaborators.length > 0 && (
              <div className="flex-shrink-0">
                <div className="flex -space-x-2">
                  {activity.collaborators.slice(0, 3).map((collab, idx) => (
                    <div
                      key={idx}
                      className="w-8 h-8 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink text-white flex items-center justify-center text-xs font-bold border-2 border-white"
                      title={collab.name}
                    >
                      {collab.name
                        ? collab.name.charAt(0).toUpperCase()
                        : '?'}
                    </div>
                  ))}
                  {activity.collaborators.length > 3 && (
                    <div className="w-8 h-8 rounded-full bg-gray-200 text-gray-600 flex items-center justify-center text-xs font-bold border-2 border-white">
                      +{activity.collaborators.length - 3}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
