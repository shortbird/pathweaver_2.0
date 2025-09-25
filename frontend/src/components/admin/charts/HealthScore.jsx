import React from 'react'

const HealthScore = ({ score, alerts, loading = false }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="w-24 h-24 bg-gray-200 rounded-full mx-auto mb-4"></div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-full"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
          </div>
        </div>
      </div>
    )
  }

  const getScoreColor = (score) => {
    if (score >= 90) return 'text-green-600'
    if (score >= 70) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getScoreLabel = (score) => {
    if (score >= 90) return 'Excellent'
    if (score >= 70) return 'Good'
    if (score >= 50) return 'Fair'
    return 'Needs Attention'
  }

  const getAlertIcon = (type) => {
    switch (type) {
      case 'urgent':
        return '🚨'
      case 'warning':
        return '⚠️'
      case 'info':
        return 'ℹ️'
      default:
        return '🔔'
    }
  }

  const getAlertColor = (type) => {
    switch (type) {
      case 'urgent':
        return 'bg-red-100 border-red-200 text-red-800'
      case 'warning':
        return 'bg-yellow-100 border-yellow-200 text-yellow-800'
      case 'info':
        return 'bg-blue-100 border-blue-200 text-blue-800'
      default:
        return 'bg-gray-100 border-gray-200 text-gray-800'
    }
  }

  // Calculate circle circumference for progress ring
  const radius = 36
  const circumference = 2 * Math.PI * radius
  const strokeDasharray = circumference
  const strokeDashoffset = circumference - (score / 100) * circumference

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-6">System Health</h3>

      {/* Health Score Circle */}
      <div className="flex flex-col items-center mb-6">
        <div className="relative w-24 h-24">
          <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 80 80">
            {/* Background circle */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke="#e5e7eb"
              strokeWidth="4"
              fill="none"
            />
            {/* Progress circle */}
            <circle
              cx="40"
              cy="40"
              r={radius}
              stroke={score >= 90 ? '#10b981' : score >= 70 ? '#f59e0b' : '#ef4444'}
              strokeWidth="4"
              fill="none"
              strokeDasharray={strokeDasharray}
              strokeDashoffset={strokeDashoffset}
              strokeLinecap="round"
              className="transition-all duration-1000 ease-in-out"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-2xl font-bold ${getScoreColor(score)}`}>
              {score}
            </span>
            <span className="text-xs text-gray-500">/ 100</span>
          </div>
        </div>
        <div className="mt-2 text-center">
          <p className={`font-medium ${getScoreColor(score)}`}>
            {getScoreLabel(score)}
          </p>
        </div>
      </div>

      {/* Alerts */}
      {alerts && alerts.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium text-gray-700">Active Alerts</h4>
          {alerts.map((alert, index) => (
            <div
              key={index}
              className={`border rounded-lg p-3 ${getAlertColor(alert.type)}`}
            >
              <div className="flex items-start space-x-2">
                <span className="flex-shrink-0 text-lg">
                  {getAlertIcon(alert.type)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">
                    {alert.message}
                  </p>
                  {alert.action && (
                    <p className="text-xs mt-1 opacity-75">
                      Action: {alert.action}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No alerts message */}
      {(!alerts || alerts.length === 0) && (
        <div className="text-center py-4">
          <div className="text-2xl mb-2">✅</div>
          <p className="text-sm text-gray-500">No active alerts</p>
        </div>
      )}
    </div>
  )
}

export default HealthScore