import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../services/api'
import toast from 'react-hot-toast'
import { UsersIcon, CalendarIcon, TrophyIcon, BookOpenIcon, HeartIcon, ChatBubbleLeftIcon, SparklesIcon } from '@heroicons/react/24/outline'

export default function ObserverFeedPage() {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedStudent, setSelectedStudent] = useState(null)

  useEffect(() => {
    fetchMyStudents()
  }, [])

  const fetchMyStudents = async () => {
    try {
      setLoading(true)
      const response = await api.get('/api/observers/my-students')
      setStudents(response.data.students || [])

      // Auto-select first student if available
      if (response.data.students && response.data.students.length > 0) {
        setSelectedStudent(response.data.students[0].student_id)
      }
    } catch (error) {
      console.error('Failed to fetch students:', error)
      toast.error('Failed to load students')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-optio-purple" />
      </div>
    )
  }

  if (students.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <UsersIcon className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">No Students Yet</h2>
          <p className="text-gray-600 mb-6">
            You haven't been linked to any students yet. Wait for a student to invite you as an observer.
          </p>
          <Link
            to="/dashboard"
            className="inline-block bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-3 px-6 rounded-lg hover:shadow-lg transition-all"
          >
            Go to Dashboard
          </Link>
        </div>
      </div>
    )
  }

  const currentStudent = students.find(s => s.student_id === selectedStudent)

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Observer Feed</h1>
              <p className="text-gray-600 text-sm">Follow student learning journeys</p>
            </div>
            <Link
              to="/observer/welcome"
              className="text-optio-purple hover:text-optio-pink font-medium text-sm flex items-center gap-1"
            >
              <SparklesIcon className="w-4 h-4" />
              How to Support Students
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="grid md:grid-cols-4 gap-6">
          {/* Sidebar - Student List */}
          <div className="md:col-span-1">
            <div className="bg-white rounded-lg shadow p-4 sticky top-24">
              <h2 className="font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <UsersIcon className="w-5 h-5 text-optio-purple" />
                Students
              </h2>
              <div className="space-y-2">
                {students.map(link => (
                  <button
                    key={link.student_id}
                    onClick={() => setSelectedStudent(link.student_id)}
                    className={`w-full text-left p-3 rounded-lg transition-all ${
                      selectedStudent === link.student_id
                        ? 'bg-gradient-to-r from-optio-purple to-optio-pink text-white'
                        : 'bg-gray-50 hover:bg-gray-100 text-gray-800'
                    }`}
                  >
                    <div className="font-medium">
                      {link.student?.first_name} {link.student?.last_name}
                    </div>
                    <div className={`text-xs ${selectedStudent === link.student_id ? 'text-purple-100' : 'text-gray-500'}`}>
                      {link.relationship || 'Observer'}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Main Feed */}
          <div className="md:col-span-3">
            {currentStudent && (
              <div className="space-y-6">
                {/* Student Header */}
                <div className="bg-white rounded-lg shadow p-6">
                  <div className="flex items-center gap-4">
                    <div className="w-16 h-16 bg-gradient-to-r from-optio-purple to-optio-pink rounded-full flex items-center justify-center text-white text-2xl font-bold">
                      {currentStudent.student?.first_name?.[0]}{currentStudent.student?.last_name?.[0]}
                    </div>
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">
                        {currentStudent.student?.first_name} {currentStudent.student?.last_name}
                      </h2>
                      <p className="text-gray-600">Learning Journey</p>
                    </div>
                  </div>
                </div>

                {/* Coming Soon Message */}
                <div className="bg-white rounded-lg shadow p-8 text-center">
                  <SparklesIcon className="w-16 h-16 text-optio-purple mx-auto mb-4" />
                  <h3 className="text-2xl font-bold text-gray-900 mb-2">Activity Feed Coming Soon!</h3>
                  <p className="text-gray-600 mb-6 max-w-md mx-auto">
                    We're building a beautiful feed to show you {currentStudent.student?.first_name}'s recent achievements,
                    quest completions, and learning milestones.
                  </p>

                  <div className="max-w-2xl mx-auto text-left">
                    <h4 className="font-semibold text-gray-900 mb-3">What's Coming:</h4>
                    <div className="grid md:grid-cols-2 gap-3">
                      <div className="flex items-start gap-2 bg-purple-50 p-3 rounded-lg">
                        <CalendarIcon className="w-5 h-5 text-optio-purple flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-gray-900 text-sm">Chronological Feed</div>
                          <div className="text-gray-600 text-xs">Recent completions and achievements</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 bg-pink-50 p-3 rounded-lg">
                        <HeartIcon className="w-5 h-5 text-optio-pink flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-gray-900 text-sm">Emoji Reactions</div>
                          <div className="text-gray-600 text-xs">Quick ways to celebrate progress</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 bg-blue-50 p-3 rounded-lg">
                        <ChatBubbleLeftIcon className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-gray-900 text-sm">Conversation Starters</div>
                          <div className="text-gray-600 text-xs">Prompts to engage meaningfully</div>
                        </div>
                      </div>
                      <div className="flex items-start gap-2 bg-green-50 p-3 rounded-lg">
                        <ImageIcon className="w-5 h-5 text-green-500 flex-shrink-0 mt-0.5" />
                        <div>
                          <div className="font-medium text-gray-900 text-sm">Evidence Gallery</div>
                          <div className="text-gray-600 text-xs">Photos and videos of their work</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Temporary: View Portfolio Link */}
                <div className="bg-gradient-to-r from-optio-purple to-optio-pink rounded-lg shadow p-6 text-white text-center">
                  <h3 className="text-xl font-bold mb-2">In the meantime...</h3>
                  <p className="mb-4 text-purple-100">
                    You can view {currentStudent.student?.first_name}'s portfolio to see their completed work
                  </p>
                  <Link
                    to={`/public/${currentStudent.student?.portfolio_slug}`}
                    className="inline-block bg-white text-optio-purple font-semibold py-3 px-6 rounded-lg hover:shadow-lg transition-all"
                  >
                    View Portfolio
                  </Link>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
