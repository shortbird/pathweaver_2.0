import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import { checkinAPI } from '../../services/api'

const CheckinHistoryModal = ({ studentId, studentName, onClose }) => {
  const [loading, setLoading] = useState(true)
  const [checkins, setCheckins] = useState([])
  const [expandedCheckinId, setExpandedCheckinId] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchCheckinHistory()
  }, [studentId])

  const fetchCheckinHistory = async () => {
    try {
      setLoading(true)
      const response = await checkinAPI.getStudentCheckins(studentId)

      if (response.data.success) {
        setCheckins(response.data.checkins || [])
      }
    } catch (err) {
      console.error('Error fetching check-in history:', err)
      setError('Failed to load check-in history')
    } finally {
      setLoading(false)
    }
  }

  const toggleExpanded = (checkinId) => {
    setExpandedCheckinId(expandedCheckinId === checkinId ? null : checkinId)
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 text-white">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-1">Check-in History</h2>
              <p className="text-purple-100 font-medium">{studentName}</p>
              {checkins.length > 0 && (
                <p className="text-purple-100 text-sm mt-2">
                  Total check-ins: {checkins.length}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
            >
              <XMarkIcon size={24} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple"></div>
            </div>
          ) : error ? (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          ) : checkins.length === 0 ? (
            <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-12 text-center">
              <p className="text-gray-500 font-medium text-lg">No check-ins yet</p>
              <p className="text-gray-400 text-sm mt-2">Check-ins will appear here after your first meeting</p>
            </div>
          ) : (
            <div className="space-y-4">
              {checkins.map((checkin) => (
                <div
                  key={checkin.id}
                  className="border-2 border-gray-200 rounded-lg overflow-hidden hover:border-purple-300 transition-colors"
                >
                  {/* Check-in Summary (Always Visible) */}
                  <div
                    className="p-4 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => toggleExpanded(checkin.id)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <p className="font-bold text-gray-800 text-lg">
                          {checkin.checkin_date_formatted || formatDate(checkin.checkin_date)}
                        </p>
                        {checkin.growth_moments && (
                          <p className="text-gray-600 text-sm mt-1 line-clamp-2">
                            {checkin.growth_moments}
                          </p>
                        )}
                      </div>
                      <button
                        className="ml-4 text-optio-purple font-semibold text-sm hover:text-purple-700"
                      >
                        {expandedCheckinId === checkin.id ? 'Hide' : 'View Details'}
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details */}
                  {expandedCheckinId === checkin.id && (
                    <div className="border-t-2 border-gray-200 bg-gray-50 p-6 space-y-6">
                      {/* Active Quests Snapshot */}
                      {checkin.active_quests_snapshot && checkin.active_quests_snapshot.length > 0 && (
                        <div>
                          <h4 className="font-bold text-gray-800 mb-2">Active Quests at Time of Check-in</h4>
                          <div className="space-y-2">
                            {checkin.active_quests_snapshot.map((quest, idx) => {
                              // Find quest-specific notes for this quest
                              const questNote = checkin.quest_notes?.find(note => note.quest_id === quest.quest_id)

                              return (
                                <div key={idx} className="bg-white border border-gray-200 rounded-lg p-3">
                                  <p className="font-semibold text-gray-800">{quest.title}</p>
                                  <div className="flex items-center gap-3 mt-2">
                                    <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden">
                                      <div
                                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                                        style={{ width: `${quest.completion_percent}%` }}
                                      />
                                    </div>
                                    <span className="text-xs font-medium text-gray-600">
                                      {quest.completion_percent}%
                                    </span>
                                  </div>

                                  {/* Quest-specific notes */}
                                  {questNote && questNote.notes && (
                                    <div className="mt-3 pt-3 border-t border-gray-200">
                                      <p className="text-xs font-semibold text-purple-700 mb-1">Quest Notes:</p>
                                      <p className="text-sm text-gray-700 bg-purple-50 p-2 rounded">
                                        {questNote.notes}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )}

                      {/* Growth Moments */}
                      {checkin.growth_moments && (
                        <div>
                          <h4 className="font-bold text-gray-800 mb-2">Growth Moments</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{checkin.growth_moments}</p>
                        </div>
                      )}

                      {/* Student Voice */}
                      {checkin.student_voice && (
                        <div>
                          <h4 className="font-bold text-gray-800 mb-2">Student Voice</h4>
                          <p className="text-gray-700 italic whitespace-pre-wrap bg-purple-50 border-l-4 border-purple-400 p-3 rounded">
                            "{checkin.student_voice}"
                          </p>
                        </div>
                      )}

                      {/* Obstacles */}
                      {checkin.obstacles && (
                        <div>
                          <h4 className="font-bold text-gray-800 mb-2">Obstacles & Challenges</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{checkin.obstacles}</p>
                        </div>
                      )}

                      {/* Solutions */}
                      {checkin.solutions && (
                        <div>
                          <h4 className="font-bold text-gray-800 mb-2">Solutions & Strategies</h4>
                          <p className="text-gray-700 whitespace-pre-wrap">{checkin.solutions}</p>
                        </div>
                      )}

                      {/* Private Advisor Notes */}
                      {checkin.advisor_notes && (
                        <div>
                          <h4 className="font-bold text-red-800 mb-2">Private Advisor Notes</h4>
                          <p className="text-gray-700 whitespace-pre-wrap bg-red-50 border-l-4 border-red-400 p-3 rounded">
                            {checkin.advisor_notes}
                          </p>
                        </div>
                      )}

                      {/* Metadata */}
                      <div className="text-xs text-gray-500 pt-4 border-t border-gray-300">
                        Created: {formatDate(checkin.created_at)}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t-2 border-gray-200 p-4 bg-gray-50">
          <button
            onClick={onClose}
            className="w-full px-6 py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

export default CheckinHistoryModal
