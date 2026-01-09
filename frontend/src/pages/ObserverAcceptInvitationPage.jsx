import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import { SparklesIcon, HeartIcon, ChatBubbleLeftIcon, PhotoIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

export default function ObserverAcceptInvitationPage() {
  const { invitationCode } = useParams()
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [invitationValid, setInvitationValid] = useState(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    // If user is already logged in, auto-accept the invitation
    if (currentUser && invitationCode) {
      handleAutoAccept()
    }
  }, [currentUser, invitationCode])

  const handleAutoAccept = async () => {
    setAccepting(true)
    try {
      const response = await api.post(`/api/observers/accept/${invitationCode}`, {})

      if (response.data.status === 'success') {
        // Check if user has an existing role (parent, student, advisor, etc.)
        if (response.data.has_existing_role) {
          // User keeps their primary role, gained observer access via observer_student_links
          toast.success('Observer access added! You can now view this student from the Observer Feed.')

          // Navigate based on their primary role
          const role = response.data.user_role
          if (role === 'parent') {
            navigate('/parent')
          } else if (role === 'student') {
            navigate('/dashboard')
          } else if (role === 'advisor' || role === 'org_admin') {
            navigate('/admin')
          } else if (role === 'superadmin') {
            navigate('/admin')
          } else {
            // Default - show them the observer feed since they now have access
            navigate('/observer/feed')
          }
        } else {
          // New observer-only account - show welcome page
          toast.success('Invitation accepted! Welcome to Optio.')
          navigate('/observer/welcome')
        }
      }
    } catch (error) {
      console.error('Failed to accept invitation:', error)
      const errorMessage = error.response?.data?.error || 'Failed to accept invitation. Please try again.'
      toast.error(errorMessage)
      setInvitationValid(false)
    } finally {
      setAccepting(false)
    }
  }

  if (currentUser && accepting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-optio-purple mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Accepting Invitation...</h2>
          <p className="text-gray-600">Linking your account to the student</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
      <div className="max-w-2xl w-full">
        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-8 text-white text-center">
            <SparklesIcon className="w-16 h-16 mx-auto mb-4" />
            <h1 className="text-3xl font-bold mb-2">You've Been Invited!</h1>
            <p className="text-purple-100 text-lg">
              A student has invited you to follow their learning journey on Optio
            </p>
          </div>

          {/* Content */}
          <div className="p-8">
            <div className="mb-8">
              <h2 className="text-2xl font-bold text-gray-800 mb-4">What is Optio?</h2>
              <p className="text-gray-700 leading-relaxed mb-4">
                Optio is a learning platform where students explore their interests through self-directed quests,
                build real-world skills, and create a personalized portfolio. We believe that{' '}
                <strong className="text-optio-purple">the process is the goal</strong> - focusing on curiosity,
                effort, and growth rather than grades or test scores.
              </p>
            </div>

            <div className="mb-8">
              <h3 className="text-xl font-bold text-gray-800 mb-4">As an Observer, you'll be able to:</h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-800">View completed quests and tasks</p>
                    <p className="text-gray-600 text-sm">See what the student is working on and celebrating</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <PhotoIcon className="w-6 h-6 text-blue-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-800">See evidence of their work</p>
                    <p className="text-gray-600 text-sm">Photos, videos, and documents they upload</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <ChatBubbleLeftIcon className="w-6 h-6 text-purple-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-800">Leave encouraging comments</p>
                    <p className="text-gray-600 text-sm">Support their learning with positive feedback</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <HeartIcon className="w-6 h-6 text-pink-500 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-semibold text-gray-800">Celebrate milestones and achievements</p>
                    <p className="text-gray-600 text-sm">Be part of their learning journey</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Call to Action */}
            <div className="border-t border-gray-200 pt-6">
              {currentUser ? (
                <div className="text-center">
                  <p className="text-gray-600 mb-4">You're already logged in. Click below to accept the invitation.</p>
                  <button
                    onClick={handleAutoAccept}
                    disabled={accepting}
                    className="w-full bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-4 px-6 rounded-xl hover:shadow-lg transition-all duration-200 disabled:opacity-50"
                  >
                    {accepting ? 'Accepting...' : 'Accept Invitation'}
                  </button>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-gray-700 mb-4 font-medium">
                    To accept this invitation, please create an account or log in:
                  </p>
                  <div className="space-y-3">
                    <Link
                      to={`/register?invitation=${invitationCode}`}
                      className="block w-full bg-gradient-to-r from-optio-purple to-optio-pink text-white font-semibold py-4 px-6 rounded-xl hover:shadow-lg transition-all duration-200 text-center"
                    >
                      Create Observer Account
                    </Link>
                    <Link
                      to={`/login?invitation=${invitationCode}`}
                      className="block w-full bg-white border-2 border-optio-purple text-optio-purple font-semibold py-4 px-6 rounded-xl hover:bg-purple-50 transition-all duration-200 text-center"
                    >
                      I Already Have an Account
                    </Link>
                  </div>
                  <p className="text-sm text-gray-500 mt-4">
                    Your invitation code will be saved when you register or log in
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Note */}
        <div className="text-center mt-6">
          <p className="text-gray-600 text-sm">
            Questions?{' '}
            <a href="mailto:support@optioeducation.com" className="text-optio-purple hover:underline font-medium">
              Contact us
            </a>
          </p>
        </div>
      </div>
    </div>
  )
}
