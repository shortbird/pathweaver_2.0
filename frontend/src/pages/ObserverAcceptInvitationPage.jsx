import React, { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import api from '../services/api'
import toast from 'react-hot-toast'
import { HeartIcon, ChatBubbleLeftIcon, PhotoIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

export default function ObserverAcceptInvitationPage() {
  const { invitationCode } = useParams()
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [invitationValid, setInvitationValid] = useState(null)
  const [accepting, setAccepting] = useState(false)
  const [isVisible, setIsVisible] = useState(false)
  const [studentName, setStudentName] = useState(null)
  const [studentAvatar, setStudentAvatar] = useState(null)
  const [invitationError, setInvitationError] = useState(null)

  // Fetch invitation details for personalization
  useEffect(() => {
    const fetchInvitationDetails = async () => {
      if (!invitationCode) {
        setLoading(false)
        setInvitationValid(false)
        return
      }

      try {
        const response = await api.get(`/api/observers/invitation/${invitationCode}/preview`)
        if (response.data.valid) {
          setInvitationValid(true)
          setStudentName(response.data.student_name)
          setStudentAvatar(response.data.student_avatar)
        } else {
          setInvitationValid(false)
          // Handle error - could be a string or an object with a message property
          const errorData = response.data.error
          const errorMessage = typeof errorData === 'string'
            ? errorData
            : (errorData?.message || 'Invalid invitation')
          setInvitationError(errorMessage)
        }
      } catch (error) {
        console.error('Failed to fetch invitation details:', error)
        setInvitationValid(false)
        // Handle error - could be a string or an object with a message property
        const errorData = error.response?.data?.error
        const errorMessage = typeof errorData === 'string'
          ? errorData
          : (errorData?.message || error.response?.data?.message || 'Unable to load invitation')
        setInvitationError(errorMessage)
      } finally {
        setLoading(false)
      }
    }

    fetchInvitationDetails()
  }, [invitationCode])

  // Trigger fade-in animation after loading
  useEffect(() => {
    if (!loading) {
      const timer = setTimeout(() => setIsVisible(true), 50)
      return () => clearTimeout(timer)
    }
  }, [loading])

  // If user is already logged in and invitation is valid, auto-accept
  useEffect(() => {
    if (currentUser && invitationCode && invitationValid === true) {
      handleAutoAccept()
    }
  }, [currentUser, invitationCode, invitationValid])

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
            navigate('/parent', { state: { freshInvitation: true } })
          } else if (role === 'student') {
            navigate('/dashboard')
          } else if (role === 'advisor' || role === 'org_admin') {
            navigate('/admin')
          } else if (role === 'superadmin') {
            navigate('/admin')
          } else {
            // Default - show them the observer feed since they now have access
            navigate('/observer/feed', { state: { freshInvitation: true } })
          }
        } else {
          // New observer-only account - show welcome page
          toast.success('Invitation accepted! Welcome to Optio.')
          navigate('/observer/welcome', { state: { freshInvitation: true } })
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

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-4 border-optio-purple mx-auto mb-4" />
          <p className="text-gray-600">Loading invitation...</p>
        </div>
      </div>
    )
  }

  // Invalid invitation state
  if (invitationValid === false) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <img
            src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
            alt="Optio Education"
            className="h-10 mx-auto mb-6"
          />
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Invitation Not Available</h2>
          <p className="text-gray-600 mb-6">
            {invitationError || 'This invitation link is no longer valid. It may have expired or been revoked.'}
          </p>
          <p className="text-sm text-gray-500">
            Please ask the student or their parent to send you a new invitation link.
          </p>
        </div>
      </div>
    )
  }

  // Accepting state (logged in user)
  if (currentUser && accepting) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-optio-purple mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Accepting Invitation...</h2>
          <p className="text-gray-600">Linking your account to {studentName || 'the student'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 via-white to-pink-50 flex items-center justify-center p-4 sm:p-6">
      <div
        className={`max-w-2xl w-full transition-all duration-500 ease-out ${
          isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
        }`}
      >
        {/* Logo above card */}
        <div className="text-center mb-6">
          <img
            src="https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png"
            alt="Optio Education"
            className="h-10 sm:h-12 mx-auto"
          />
        </div>

        {/* Main Card */}
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-optio-purple to-optio-pink p-6 sm:p-8 text-white text-center">
            {studentAvatar && (
              <div className="mb-6">
                <div className="relative inline-block">
                  <img
                    src={studentAvatar}
                    alt={studentName || 'Student'}
                    className="w-36 h-36 sm:w-44 sm:h-44 rounded-full mx-auto border-4 border-white object-cover shadow-2xl"
                  />
                  <div className="absolute inset-0 rounded-full ring-4 ring-white/20 ring-offset-4 ring-offset-transparent"></div>
                </div>
              </div>
            )}
            <h1 className="text-2xl sm:text-3xl font-bold">
              You've been invited to cheer on {studentName || 'a student'}!
            </h1>
          </div>

          {/* Content */}
          <div className="p-6 sm:p-8">
            {/* What is Optio - Improved copy */}
            <div className="mb-8">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-800 mb-3">Stay Connected to Learning</h2>
              <p className="text-gray-700 leading-relaxed">
                Optio helps students explore their interests through hands-on projects and build real-world skills.
                As an observer, you'll have a window into their learning journey - celebrating their growth and progress along the way.
              </p>
            </div>

            {/* Observer capabilities */}
            <div className="mb-8">
              <h3 className="text-lg sm:text-xl font-bold text-gray-800 mb-4">As an observer, you'll be able to:</h3>
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
                      Create observer account
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
