import React from 'react'

const BarChart = ({ data, title, xLabel, yLabel, loading = false }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-end space-x-2">
                <div className="h-4 bg-gray-200 rounded w-20"></div>
                <div className={`bg-gray-200 rounded-t h-${8 + (i * 4)}`} style={{ width: `${20 + (i * 10)}%` }}></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">📊</div>
          <p>No data available</p>
        </div>
      </div>
    )
  }

  const maxValue = Math.max(...Object.values(data))
  const entries = Object.entries(data)

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>

      <div className="space-y-3">
        {entries.map(([key, value], index) => {
          const percentage = maxValue > 0 ? (value / maxValue) * 100 : 0

          return (
            <div key={key} className="flex items-center">
              <div className="w-32 text-sm text-gray-600 truncate" title={key}>
                {key}
              </div>
              <div className="flex-1 mx-4">
                <div className="bg-gray-200 rounded-full h-4 relative overflow-hidden">
                  <div
                    className="bg-gradient-to-r bg-gradient-primary-reverse h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${percentage}%` }}
                  ></div>
                </div>
              </div>
              <div className="w-16 text-right text-sm font-medium text-gray-900">
                {value.toLocaleString()}
              </div>
            </div>
          )
        })}
      </div>

      {(xLabel || yLabel) && (
        <div className="mt-4 flex justify-between text-xs text-gray-500">
          <span>{xLabel}</span>
          <span>{yLabel}</span>
        </div>
      )}
    </div>
  )
}

export default BarChart