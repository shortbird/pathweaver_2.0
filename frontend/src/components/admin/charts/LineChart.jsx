import React from 'react'

const LineChart = ({ data, title, height = 200, loading = false }) => {
  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="bg-gray-200 rounded" style={{ height: `${height}px` }}></div>
        </div>
      </div>
    )
  }

  if (!data || Object.keys(data).length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold mb-4">{title}</h3>
        <div className="text-center py-8 text-gray-500">
          <div className="text-4xl mb-2">📈</div>
          <p>No data available</p>
        </div>
      </div>
    )
  }

  const entries = Object.entries(data)
  const maxValue = Math.max(...Object.values(data))
  const minValue = Math.min(...Object.values(data))
  const range = maxValue - minValue || 1

  // Calculate points for the line
  const points = entries.map(([date, value], index) => {
    const x = (index / (entries.length - 1)) * 100
    const y = 100 - ((value - minValue) / range) * 100
    return { x, y, value, date }
  })

  // Generate SVG path
  const pathData = points.reduce((path, point, index) => {
    const command = index === 0 ? 'M' : 'L'
    return `${path} ${command} ${point.x} ${point.y}`
  }, '')

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>

      <div className="relative" style={{ height: `${height}px` }}>
        <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
          {/* Grid lines */}
          <defs>
            <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#f3f4f6" strokeWidth="0.5"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />

          {/* Area under curve */}
          <path
            d={`${pathData} L 100 100 L 0 100 Z`}
            fill="url(#gradient)"
            opacity="0.3"
          />

          {/* Line */}
          <path
            d={pathData}
            fill="none"
            stroke="url(#lineGradient)"
            strokeWidth="0.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data points */}
          {points.map((point, index) => (
            <circle
              key={index}
              cx={point.x}
              cy={point.y}
              r="1"
              fill="#6d469b"
              stroke="white"
              strokeWidth="0.5"
              className="hover:r-1.5 transition-all duration-200"
            />
          ))}

          {/* Gradients */}
          <defs>
            <linearGradient id="gradient" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="#ef597b" />
              <stop offset="100%" stopColor="#6d469b" />
            </linearGradient>
            <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#ef597b" />
              <stop offset="100%" stopColor="#6d469b" />
            </linearGradient>
          </defs>
        </svg>

        {/* Tooltips on hover */}
        {points.map((point, index) => (
          <div
            key={index}
            className="absolute transform -translate-x-1/2 -translate-y-full pointer-events-none opacity-0 hover:opacity-100 transition-opacity duration-200 bg-gray-800 text-white text-xs px-2 py-1 rounded"
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
            }}
          >
            {point.value} on {new Date(point.date).toLocaleDateString()}
          </div>
        ))}
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between mt-2 text-xs text-gray-500">
        <span>{new Date(entries[0]?.[0]).toLocaleDateString()}</span>
        <span>{new Date(entries[entries.length - 1]?.[0]).toLocaleDateString()}</span>
      </div>

      {/* Y-axis range */}
      <div className="flex justify-between items-center mt-2">
        <div className="text-xs text-gray-500">
          Range: {minValue} - {maxValue}
        </div>
        <div className="text-sm font-medium text-gray-900">
          Latest: {entries[entries.length - 1]?.[1]}
        </div>
      </div>
    </div>
  )
}

export default LineChart