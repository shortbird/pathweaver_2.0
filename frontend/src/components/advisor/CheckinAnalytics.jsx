import { useState, useEffect } from 'react'
import { Calendar, TrendingUp, AlertCircle, CheckCircle } from 'lucide-react'
import { checkinAPI } from '../../services/api'

const CheckinAnalytics = () => {
  const [loading, setLoading] = useState(true)
  const [analytics, setAnalytics] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchAnalytics()
  }, [])

  const fetchAnalytics = async () => {
    try {
      setLoading(true)
      const response = await checkinAPI.getAnalytics()

      if (response.data.success) {
        setAnalytics(response.data.analytics)
      }
    } catch (err) {
      console.error('Error fetching check-in analytics:', err)
      setError('Failed to load analytics')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-md p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
            <div className="h-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded-lg">
        <p className="text-red-800 font-medium">{error}</p>
      </div>
    )
  }

  if (!analytics) {
    return null
  }

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-4">
        <h3 className="text-xl font-bold text-white flex items-center gap-2">
          <TrendingUp size={24} />
          Check-in Overview
        </h3>
      </div>

      {/* Stats Grid */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Total Check-ins */}
          <div className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Total Check-ins</p>
                <p className="text-3xl font-bold text-purple-700">
                  {analytics.total_checkins || 0}
                </p>
              </div>
              <Calendar className="text-purple-400" size={32} />
            </div>
          </div>

          {/* This Month */}
          <div className="bg-gradient-to-br from-blue-50 to-cyan-50 border-2 border-blue-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">This Month</p>
                <p className="text-3xl font-bold text-blue-700">
                  {analytics.checkins_this_month || 0}
                </p>
              </div>
              <TrendingUp className="text-blue-400" size={32} />
            </div>
          </div>

          {/* Needs Attention */}
          <div className="bg-gradient-to-br from-orange-50 to-yellow-50 border-2 border-orange-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-600 mb-1">Needs Check-in</p>
                <p className="text-3xl font-bold text-orange-700">
                  {analytics.students_needing_checkin?.length || 0}
                </p>
              </div>
              <AlertCircle className="text-orange-400" size={32} />
            </div>
          </div>
        </div>

        {/* Students Needing Check-in */}
        {analytics.students_needing_checkin && analytics.students_needing_checkin.length > 0 ? (
          <div>
            <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
              <AlertCircle size={20} className="text-orange-600" />
              Students Needing Check-in (7+ Days)
            </h4>
            <div className="space-y-2">
              {analytics.students_needing_checkin.map((student) => (
                <div
                  key={student.student_id}
                  className="bg-orange-50 border border-orange-200 rounded-lg px-4 py-3 flex items-center justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-800">{student.name}</p>
                    <p className="text-xs text-gray-600">
                      {student.days_since_checkin === 999
                        ? 'Never checked in'
                        : `Last check-in: ${student.days_since_checkin} days ago`}
                    </p>
                  </div>
                  <button
                    onClick={() => window.location.href = `/advisor/checkin/${student.student_id}`}
                    className="px-4 py-2 bg-orange-500 text-white rounded-lg font-semibold text-sm hover:bg-orange-600 transition-colors"
                  >
                    Check in
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-lg p-6 text-center">
            <CheckCircle className="mx-auto text-green-600 mb-3" size={48} />
            <h4 className="font-bold text-green-800 text-lg mb-2">All Students Up to Date!</h4>
            <p className="text-green-700">
              Great work! All your students have been checked in within the last 7 days.
            </p>
          </div>
        )}

        {/* Empty State */}
        {analytics.total_checkins === 0 && (
          <div className="text-center py-8">
            <Calendar className="mx-auto text-gray-300 mb-4" size={48} />
            <p className="text-gray-500 font-medium">No check-ins yet</p>
            <p className="text-gray-400 text-sm mt-1">
              Start checking in with your students to see analytics here
            </p>
          </div>
        )}
      </div>
    </div>
  )
}

export default CheckinAnalytics
