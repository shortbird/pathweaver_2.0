import React from 'react'

const MetricCard = ({ title, value, subtitle, trend, icon, gradient = true }) => {
  const getTrendIcon = () => {
    if (!trend) return null

    if (trend > 0) {
      return <span className="text-green-500 text-sm">↗ +{trend}%</span>
    } else if (trend < 0) {
      return <span className="text-red-500 text-sm">↘ {trend}%</span>
    }
    return <span className="text-gray-500 text-sm">→ 0%</span>
  }

  return (
    <div className={`rounded-lg p-6 shadow-lg ${
      gradient
        ? 'bg-gradient-primary text-white'
        : 'bg-white border border-gray-200'
    }`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <h3 className={`text-sm font-medium ${gradient ? 'text-white/80' : 'text-gray-600'}`}>
            {title}
          </h3>
          <div className="mt-2">
            <p className={`text-2xl font-bold ${gradient ? 'text-white' : 'text-gray-900'}`}>
              {value?.toLocaleString() || '0'}
            </p>
            {subtitle && (
              <p className={`text-sm ${gradient ? 'text-white/70' : 'text-gray-500'}`}>
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {icon && (
          <div className={`text-2xl ${gradient ? 'text-white/80' : 'text-gray-400'}`}>
            {icon}
          </div>
        )}
      </div>
      {trend !== undefined && (
        <div className="mt-4 flex items-center">
          {getTrendIcon()}
          <span className={`ml-2 text-xs ${gradient ? 'text-white/70' : 'text-gray-500'}`}>
            vs last period
          </span>
        </div>
      )}
    </div>
  )
}

export default MetricCard