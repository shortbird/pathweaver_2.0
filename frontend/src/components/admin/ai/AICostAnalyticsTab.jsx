import React, { useState, useEffect } from 'react'
import api from '../../../services/api'
import toast from 'react-hot-toast'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell
} from 'recharts'
import {
  CurrencyDollarIcon,
  ClockIcon,
  BoltIcon,
  ChartBarIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon
} from '@heroicons/react/24/outline'

const AICostAnalyticsTab = () => {
  const [summary, setSummary] = useState(null)
  const [serviceBreakdown, setServiceBreakdown] = useState([])
  const [trends, setTrends] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState('30')

  useEffect(() => {
    fetchAllData()
  }, [dateRange])

  const fetchAllData = async () => {
    try {
      setLoading(true)
      const [summaryRes, servicesRes, trendsRes] = await Promise.all([
        api.get(`/api/admin/ai/costs/summary?days=${dateRange}`),
        api.get(`/api/admin/ai/costs/by-service?days=${dateRange}`),
        api.get(`/api/admin/ai/costs/trends?days=${dateRange}`)
      ])

      setSummary(summaryRes.data)
      setServiceBreakdown(servicesRes.data.services || [])
      setTrends(trendsRes.data.trends || [])
    } catch (error) {
      console.error('Failed to load cost analytics:', error)
      toast.error('Failed to load cost data')
    } finally {
      setLoading(false)
    }
  }

  const formatCost = (cost) => {
    if (cost < 0.01) {
      return `$${cost.toFixed(6)}`
    }
    return `$${cost.toFixed(4)}`
  }

  const formatTokens = (tokens) => {
    if (tokens >= 1000000) {
      return `${(tokens / 1000000).toFixed(2)}M`
    }
    if (tokens >= 1000) {
      return `${(tokens / 1000).toFixed(1)}K`
    }
    return tokens.toString()
  }

  // Colors for the bar chart
  const COLORS = ['#7C3AED', '#EC4899', '#8B5CF6', '#F472B6', '#A78BFA', '#F9A8D4']

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
      </div>
    )
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900" style={{ fontFamily: 'Poppins, sans-serif' }}>
            AI Cost Analytics
          </h2>
          <p className="text-gray-600 mt-1" style={{ fontFamily: 'Poppins, sans-serif' }}>
            Track token usage and API costs across all AI services
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value)}
            className="rounded-lg border-gray-300 shadow-sm focus:border-optio-purple focus:ring-optio-purple"
          >
            <option value="7">Last 7 days</option>
            <option value="14">Last 14 days</option>
            <option value="30">Last 30 days</option>
            <option value="60">Last 60 days</option>
            <option value="90">Last 90 days</option>
          </select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-green-100 rounded-lg">
              <CurrencyDollarIcon className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Cost</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCost(summary?.total_cost_usd || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-purple-100 rounded-lg">
              <BoltIcon className="h-6 w-6 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Tokens</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatTokens(summary?.total_tokens || 0)}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-blue-100 rounded-lg">
              <ChartBarIcon className="h-6 w-6 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Total Requests</p>
              <p className="text-2xl font-bold text-gray-900">
                {summary?.total_requests?.toLocaleString() || 0}
              </p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-pink-100 rounded-lg">
              <ClockIcon className="h-6 w-6 text-pink-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">Avg Cost/Request</p>
              <p className="text-2xl font-bold text-gray-900">
                {formatCost(summary?.avg_cost_per_request || 0)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Cost Trend Chart */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Cost Trend</h3>
        {trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={trends}>
              <defs>
                <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#7C3AED" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#7C3AED" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => {
                  const date = new Date(value)
                  return `${date.getMonth() + 1}/${date.getDate()}`
                }}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `$${value.toFixed(4)}`}
              />
              <Tooltip
                formatter={(value) => [`$${value.toFixed(6)}`, 'Cost']}
                labelFormatter={(label) => new Date(label).toLocaleDateString()}
              />
              <Area
                type="monotone"
                dataKey="cost_usd"
                stroke="#7C3AED"
                fillOpacity={1}
                fill="url(#colorCost)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-500">
            No cost data available for this period
          </div>
        )}
      </div>

      {/* Service Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Cost by Service</h3>
          {serviceBreakdown.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={serviceBreakdown} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis
                  type="number"
                  tick={{ fontSize: 12 }}
                  tickFormatter={(value) => `$${value.toFixed(4)}`}
                />
                <YAxis
                  dataKey="service_name"
                  type="category"
                  tick={{ fontSize: 11 }}
                  width={150}
                  tickFormatter={(value) => value.replace('Service', '').replace('AI', '')}
                />
                <Tooltip
                  formatter={(value) => [`$${value.toFixed(6)}`, 'Cost']}
                />
                <Bar dataKey="total_cost_usd" radius={[0, 4, 4, 0]}>
                  {serviceBreakdown.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No service data available
            </div>
          )}
        </div>

        {/* Service Table */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Service Details</h3>
          {serviceBreakdown.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-gray-200">
                    <th className="text-left py-3 px-2 text-xs font-medium text-gray-500 uppercase">Service</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-gray-500 uppercase">Requests</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-gray-500 uppercase">Tokens</th>
                    <th className="text-right py-3 px-2 text-xs font-medium text-gray-500 uppercase">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {serviceBreakdown.map((service, index) => (
                    <tr key={service.service_name} className="border-b border-gray-100">
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          />
                          <span className="text-sm font-medium text-gray-900">
                            {service.service_name.replace('Service', '').replace('AI', '')}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-2 text-right text-sm text-gray-600">
                        {service.requests.toLocaleString()}
                      </td>
                      <td className="py-3 px-2 text-right text-sm text-gray-600">
                        {formatTokens(service.total_tokens)}
                      </td>
                      <td className="py-3 px-2 text-right text-sm font-medium text-gray-900">
                        {formatCost(service.total_cost_usd)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="flex items-center justify-center h-64 text-gray-500">
              No service data available
            </div>
          )}
        </div>
      </div>

      {/* Token Breakdown */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Token Usage Breakdown</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">Input Tokens</p>
            <p className="text-xl font-bold text-gray-900">
              {formatTokens(summary?.total_input_tokens || 0)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              @ $0.075/1M = {formatCost((summary?.total_input_tokens || 0) / 1000000 * 0.075)}
            </p>
          </div>
          <div className="text-center p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">Output Tokens</p>
            <p className="text-xl font-bold text-gray-900">
              {formatTokens(summary?.total_output_tokens || 0)}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              @ $0.30/1M = {formatCost((summary?.total_output_tokens || 0) / 1000000 * 0.30)}
            </p>
          </div>
          <div className="text-center p-4 bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 rounded-lg">
            <p className="text-sm text-gray-500 mb-1">Success Rate</p>
            <p className="text-xl font-bold text-gray-900">
              {summary?.total_requests > 0
                ? ((summary.successful_requests / summary.total_requests) * 100).toFixed(1)
                : 0}%
            </p>
            <p className="text-xs text-gray-400 mt-1">
              {summary?.successful_requests || 0} / {summary?.total_requests || 0} requests
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default AICostAnalyticsTab
