import React, { useState, useEffect } from 'react'
import api from '../../../services/api'
import toast from 'react-hot-toast'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts'
import { CalendarIcon, ArrowTrendingUpIcon, ArrowTrendingDownIcon, ChartBarIcon } from '@heroicons/react/24/outline'

const AIMetricsTab = () => {
  const [metrics, setMetrics] = useState(null)
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30') // days

  useEffect(() => {
    fetchMetrics()
  }, [dateRange])

  const fetchMetrics = async () => {
    try {
      setLoading(true)
      const response = await api.get(`/api/admin/ai/metrics/trends?days=${dateRange}`)
      // Transform the trends data for charts
      const trends = response.data.trends || []
      setMetrics({
        quality_trends: trends.map(t => ({ date: t.date, score: t.approval_rate || 0 })),
        approval_trends: trends.map(t => ({ date: t.date, rate: t.approval_rate || 0 })),
        volume_trends: trends.map(t => ({ date: t.date, count: t.generations || 0 })),
        performance_radar: [
          { category: 'Quality', score: 75 },
          { category: 'Approval', score: trends[trends.length-1]?.approval_rate || 0 },
          { category: 'Volume', score: Math.min(100, (trends.reduce((sum, t) => sum + t.generations, 0) / trends.length) * 10) },
          { category: 'Speed', score: 80 },
          { category: 'Accuracy', score: 70 }
        ],
        metrics_table: [],
        insights: []
      })
    } catch (error) {
      console.error('Failed to load AI metrics trends:', error)
      toast.error('Failed to load metrics data')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header with Date Range Filter */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            AI Metrics & Analytics
          </h2>
          <p className="text-gray-600 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Track performance trends and insights over time
          </p>
        </div>
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-5 h-5 text-gray-500" />
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-optio-purple"
            style={{ fontFamily: 'Poppins, sans-serif' }}
          >
            <option value="7">Last 7 days</option>
            <option value="30">Last 30 days</option>
            <option value="90">Last 90 days</option>
            <option value="365">Last year</option>
          </select>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Quality Trends Line Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Quality Score Trends
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics?.quality_trends || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px' }}
              />
              <YAxis
                style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px' }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  fontFamily: 'Poppins, sans-serif',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}
              />
              <Legend
                wrapperStyle={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px' }}
              />
              <Line
                type="monotone"
                dataKey="score"
                stroke="#6d469b"
                strokeWidth={2}
                dot={{ fill: '#6d469b', r: 4 }}
                activeDot={{ r: 6 }}
                name="Quality Score"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Approval Rate Line Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Approval Rate Trends
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={metrics?.approval_trends || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px' }}
              />
              <YAxis
                style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px' }}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{
                  fontFamily: 'Poppins, sans-serif',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}
              />
              <Legend
                wrapperStyle={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px' }}
              />
              <Line
                type="monotone"
                dataKey="rate"
                stroke="#ef597b"
                strokeWidth={2}
                dot={{ fill: '#ef597b', r: 4 }}
                activeDot={{ r: 6 }}
                name="Approval Rate %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Generation Volume Bar Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Generation Volume
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={metrics?.volume_trends || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis
                dataKey="date"
                style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px' }}
              />
              <YAxis
                style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px' }}
              />
              <Tooltip
                contentStyle={{
                  fontFamily: 'Poppins, sans-serif',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}
              />
              <Legend
                wrapperStyle={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px' }}
              />
              <Bar
                dataKey="count"
                fill="url(#barGradient)"
                name="Generations"
                radius={[8, 8, 0, 0]}
              />
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6d469b" />
                  <stop offset="100%" stopColor="#ef597b" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Performance Radar Chart */}
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Performance Overview
          </h3>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={metrics?.performance_radar || []}>
              <PolarGrid stroke="#e5e7eb" />
              <PolarAngleAxis
                dataKey="category"
                style={{ fontFamily: 'Poppins, sans-serif', fontSize: '12px' }}
              />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                style={{ fontFamily: 'Poppins, sans-serif', fontSize: '10px' }}
              />
              <Radar
                name="Performance"
                dataKey="score"
                stroke="#6d469b"
                fill="#6d469b"
                fillOpacity={0.6}
              />
              <Tooltip
                contentStyle={{
                  fontFamily: 'Poppins, sans-serif',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb'
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Metrics Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Detailed Metrics
          </h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Metric
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Current Value
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Previous Period
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Change
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider" style={{ fontFamily: 'Poppins, sans-serif' }}>
                  Trend
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {metrics?.metrics_table?.map((row, index) => (
                <MetricRow key={index} metric={row} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Insights Panel */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4" style={{ fontFamily: 'Poppins, sans-serif' }}>
          Key Insights
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {metrics?.insights?.map((insight, index) => (
            <InsightCard key={index} insight={insight} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Metric Row Component
const MetricRow = ({ metric }) => {
  const isPositive = metric.change > 0
  const changeColor = isPositive ? 'text-green-600' : 'text-red-600'
  const TrendIcon = isPositive ? ArrowTrendingUpIcon : ArrowTrendingDownIcon

  return (
    <tr>
      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {metric.name}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {metric.current}
      </td>
      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500" style={{ fontFamily: 'Poppins, sans-serif' }}>
        {metric.previous}
      </td>
      <td className={`px-6 py-4 whitespace-nowrap text-sm font-medium ${changeColor}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
        {isPositive ? '+' : ''}{metric.change}%
      </td>
      <td className="px-6 py-4 whitespace-nowrap">
        <div className="flex items-center gap-1">
          <TrendIcon className={`w-4 h-4 ${changeColor}`} />
          <span className={`text-xs font-medium ${changeColor}`} style={{ fontFamily: 'Poppins, sans-serif' }}>
            {metric.trend}
          </span>
        </div>
      </td>
    </tr>
  )
}

// Insight Card Component
const InsightCard = ({ insight }) => {
  const typeColors = {
    success: 'bg-green-50 border-green-200 text-green-800',
    warning: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    info: 'bg-blue-50 border-blue-200 text-blue-800',
    danger: 'bg-red-50 border-red-200 text-red-800'
  }

  const iconColors = {
    success: 'text-green-600',
    warning: 'text-yellow-600',
    info: 'text-blue-600',
    danger: 'text-red-600'
  }

  return (
    <div className={`p-4 border rounded-lg ${typeColors[insight.type]}`}>
      <div className="flex items-start gap-3">
        <div className={`flex-shrink-0 ${iconColors[insight.type]}`}>
          {insight.type === 'success' && <ArrowTrendingUpIcon className="w-5 h-5" />}
          {insight.type === 'warning' && <ArrowTrendingDownIcon className="w-5 h-5" />}
          {insight.type === 'info' && <ChartBarIcon className="w-5 h-5" />}
          {insight.type === 'danger' && <ArrowTrendingDownIcon className="w-5 h-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {insight.title}
          </p>
          <p className="text-xs mt-1 opacity-80" style={{ fontFamily: 'Poppins, sans-serif' }}>
            {insight.description}
          </p>
        </div>
      </div>
    </div>
  )
}

export default AIMetricsTab
