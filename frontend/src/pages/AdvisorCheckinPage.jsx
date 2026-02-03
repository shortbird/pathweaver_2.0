import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { checkinAPI } from '../services/api'

const AdvisorCheckinPage = () => {
  const { studentId } = useParams()
  const navigate = useNavigate()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  // Pre-populated data
  const [activeQuests, setActiveQuests] = useState([])
  const [lastCheckin, setLastCheckin] = useState(null)

  // Form fields
  const [checkinDate, setCheckinDate] = useState(new Date().toISOString().split('T')[0])
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [questNotes, setQuestNotes] = useState({}) // { quest_id: 'notes text' }

  useEffect(() => {
    fetchCheckinData()
  }, [studentId])

  const fetchCheckinData = async () => {
    try {
      setLoading(true)
      const response = await checkinAPI.getCheckinData(studentId)

      if (response.data.success) {
        const { active_quests, last_checkin } = response.data
        setActiveQuests(active_quests || [])
        setLastCheckin(last_checkin)
      }
    } catch (err) {
      console.error('Error fetching check-in data:', err)
      setError('Failed to load check-in data')
    } finally {
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // Check if at least one note exists (quest note or additional notes)
    const hasQuestNotes = Object.values(questNotes).some(note => note.trim())
    if (!hasQuestNotes && !additionalNotes.trim()) {
      setError('Please add at least one note')
      return
    }

    try {
      setSaving(true)
      setError(null)

      // Convert quest notes object to array format for backend
      const questNotesArray = Object.entries(questNotes)
        .filter(([questId, notes]) => notes.trim())
        .map(([questId, notes]) => ({ quest_id: questId, notes }))

      const checkinData = {
        student_id: studentId,
        checkin_date: new Date(checkinDate).toISOString(),
        advisor_notes: additionalNotes,
        active_quests_snapshot: activeQuests,
        quest_notes: questNotesArray
      }

      const response = await checkinAPI.createCheckin(checkinData)

      if (response.data.success) {
        navigate('/advisor/dashboard')
      }
    } catch (err) {
      console.error('Error saving check-in:', err)
      setError(err.response?.data?.error || 'Failed to save check-in')
    } finally {
      setSaving(false)
    }
  }

  const handleCancel = () => {
    navigate('/advisor/dashboard')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple mx-auto mb-4"></div>
          <p className="text-gray-600 font-medium">Loading check-in form...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-optio-purple to-optio-pink rounded-t-2xl p-6 text-white">
          <h1 className="text-3xl font-bold mb-2">Advisor Check-in</h1>
          <p className="text-purple-100 font-medium">Document your conversation and celebrate growth</p>
          {lastCheckin && (
            <p className="text-purple-100 text-sm mt-2">
              Last check-in: {lastCheckin.last_checkin_date_formatted} ({lastCheckin.days_since_checkin} days ago)
            </p>
          )}
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="bg-white rounded-b-2xl shadow-lg p-8 space-y-8">
          {error && (
            <div className="bg-red-50 border-l-4 border-red-500 p-4 rounded">
              <p className="text-red-800 font-medium">{error}</p>
            </div>
          )}

          {/* Check-in Date */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Check-in Date
            </label>
            <input
              type="date"
              value={checkinDate}
              onChange={(e) => setCheckinDate(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none transition-colors font-medium"
              required
            />
          </div>

          {/* Active Quests Section */}
          <div>
            <h2 className="text-xl font-bold text-gray-800 mb-4">Active Quests</h2>
            {activeQuests.length === 0 ? (
              <div className="bg-gray-50 border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <p className="text-gray-500 font-medium">No active quests</p>
              </div>
            ) : (
              <div className="grid gap-4">
                {activeQuests.map((quest) => (
                  <div
                    key={quest.quest_id}
                    className="bg-gradient-to-br from-purple-50 to-pink-50 border-2 border-purple-200 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-bold text-gray-800 text-lg mb-1">
                          {quest.title}
                        </h3>
                        <p className="text-gray-600 text-sm mb-3">
                          {quest.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mb-3">
                      <div className="flex-1 bg-white rounded-full h-3 overflow-hidden border border-purple-200">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
                          style={{ width: `${quest.completion_percent}%` }}
                        />
                      </div>
                      <span className="font-bold text-purple-700 text-sm whitespace-nowrap">
                        {quest.completed_tasks}/{quest.total_tasks} tasks ({quest.completion_percent}%)
                      </span>
                    </div>

                    {/* Quest-specific notes */}
                    <div className="mt-3 pt-3 border-t border-purple-200">
                      <label className="block text-gray-700 font-semibold text-sm mb-2">
                        Notes (optional)
                      </label>
                      <textarea
                        value={questNotes[quest.quest_id] || ''}
                        onChange={(e) => setQuestNotes(prev => ({
                          ...prev,
                          [quest.quest_id]: e.target.value
                        }))}
                        rows={2}
                        className="w-full px-3 py-2 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none transition-colors resize-none text-sm"
                        placeholder="Add notes about this quest..."
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Additional Notes */}
          <div>
            <label className="block text-gray-700 font-semibold mb-2">
              Additional Notes (optional)
            </label>
            <textarea
              value={additionalNotes}
              onChange={(e) => setAdditionalNotes(e.target.value)}
              rows={4}
              className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:border-purple-500 focus:outline-none transition-colors resize-none font-medium"
              placeholder="Any other notes from this check-in..."
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-4 pt-4">
            <button
              type="button"
              onClick={handleCancel}
              className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-50 transition-colors"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-6 py-3 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700 transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Check-in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default AdvisorCheckinPage
