import React from 'react'
import {
  LineChart, Line,
  BarChart, Bar,
  RadarChart, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts'

/**
 * AIPerformanceChart - Reusable chart component for AI metrics
 *
 * @param {string} type - Chart type: 'line' | 'bar' | 'radar'
 * @param {Array} data - Chart data array
 * @param {number} height - Chart height in pixels (default: 300)
 * @param {string} title - Optional chart title
 * @param {string} dataKey - Key for Y-axis data (default: 'value')
 * @param {string} xAxisKey - Key for X-axis data (default: 'name')
 * @param {boolean} showLegend - Show legend (default: false)
 */
const AIPerformanceChart = ({
  type = 'line',
  data = [],
  height = 300,
  title,
  dataKey = 'value',
  xAxisKey = 'name',
  showLegend = false
}) => {
  // Loading state
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        {title && <h3 className="text-lg font-semibold mb-4 text-gray-900">{title}</h3>}
        <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
          <div className="text-center text-gray-500">
            <div className="text-4xl mb-2">📊</div>
            <p>No data available</p>
          </div>
        </div>
      </div>
    )
  }

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white p-3 rounded-lg shadow-lg border border-gray-200">
          <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
          {payload.map((entry, index) => (
            <p key={index} className="text-sm" style={{ color: entry.color }}>
              {entry.name}: <span className="font-bold">{entry.value}</span>
            </p>
          ))}
        </div>
      )
    }
    return null
  }

  // Gradient definitions for optio-purple theme
  const gradientDefs = (
    <defs>
      <linearGradient id="colorGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6d469b" stopOpacity={0.8} />
        <stop offset="100%" stopColor="#ef597b" stopOpacity={0.8} />
      </linearGradient>
      <linearGradient id="lineStroke" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="#6d469b" />
        <stop offset="100%" stopColor="#ef597b" />
      </linearGradient>
    </defs>
  )

  // Render appropriate chart based on type
  const renderChart = () => {
    switch (type) {
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              {gradientDefs}
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey={xAxisKey}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <Tooltip content={<CustomTooltip />} />
              {showLegend && <Legend />}
              <Line
                type="monotone"
                dataKey={dataKey}
                stroke="url(#lineStroke)"
                strokeWidth={3}
                fill="url(#colorGradient)"
                fillOpacity={0.1}
                dot={{ fill: '#6d469b', r: 4 }}
                activeDot={{ r: 6, fill: '#ef597b' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )

      case 'bar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <BarChart data={data} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
              {gradientDefs}
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey={xAxisKey}
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <YAxis
                tick={{ fill: '#6b7280', fontSize: 12 }}
                tickLine={{ stroke: '#d1d5db' }}
              />
              <Tooltip content={<CustomTooltip />} />
              {showLegend && <Legend />}
              <Bar
                dataKey={dataKey}
                fill="url(#colorGradient)"
                radius={[8, 8, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )

      case 'radar':
        return (
          <ResponsiveContainer width="100%" height={height}>
            <RadarChart data={data} margin={{ top: 20, right: 30, bottom: 20, left: 30 }}>
              {gradientDefs}
              <PolarGrid stroke="#e5e7eb" strokeDasharray="3 3" />
              <PolarAngleAxis
                dataKey={xAxisKey}
                tick={{ fill: '#6b7280', fontSize: 12 }}
              />
              <PolarRadiusAxis
                angle={90}
                tick={{ fill: '#6b7280', fontSize: 10 }}
              />
              <Tooltip content={<CustomTooltip />} />
              {showLegend && <Legend />}
              <Radar
                dataKey={dataKey}
                stroke="#6d469b"
                strokeWidth={2}
                fill="url(#colorGradient)"
                fillOpacity={0.6}
              />
            </RadarChart>
          </ResponsiveContainer>
        )

      default:
        return (
          <div className="flex items-center justify-center" style={{ height: `${height}px` }}>
            <p className="text-red-500">Invalid chart type: {type}</p>
          </div>
        )
    }
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      {title && (
        <h3 className="text-lg font-semibold mb-4 text-gray-900">{title}</h3>
      )}
      {renderChart()}
    </div>
  )
}

export default AIPerformanceChart
