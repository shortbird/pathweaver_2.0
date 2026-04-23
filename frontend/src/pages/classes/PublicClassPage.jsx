import React, { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import api from '../../services/api'
import { getPublicCourseBySlug } from '../../services/courseService'
import { getInvitePreview } from '../../services/studentClassService'

const OPTIO_LOGO_URL =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg'

const formatKickoff = (iso) => {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  })
}

const formatCredit = (subject, amount) => {
  if (!subject || amount == null) return null
  return `${Number(amount).toFixed(2)} ${subject} credit${Number(amount) === 1 ? '' : 's'}`
}

const PublicClassPage = () => {
  const { slug } = useParams()
  const [searchParams] = useSearchParams()
  const inviteToken = searchParams.get('invite_token')
  const isPreview = searchParams.get('preview') === '1'

  const [course, setCourse] = useState(null)
  const [teacherSettings, setTeacherSettings] = useState(null)
  const [invitePreview, setInvitePreview] = useState(null)
  const [inviteError, setInviteError] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      setLoading(true)
      setError(null)
      try {
        const [classResp, settingsResp] = await Promise.all([
          getPublicCourseBySlug(slug),
          api.get('/api/platform/settings').catch(() => null),
        ])
        if (cancelled) return
        setCourse(classResp.course)
        if (settingsResp?.data?.settings) {
          setTeacherSettings(settingsResp.data.settings)
        }

        if (inviteToken) {
          try {
            const preview = await getInvitePreview(inviteToken)
            if (!cancelled) setInvitePreview(preview)
          } catch (e) {
            if (!cancelled) {
              const message =
                e?.response?.data?.message ||
                'This invite link is not valid or has expired.'
              setInviteError(message)
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError(e?.response?.data?.error || 'Class not found.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => {
      cancelled = true
    }
  }, [slug, inviteToken])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-optio-purple" />
      </div>
    )
  }

  if (error || !course) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">Class not found</h1>
        <p className="text-gray-600 mb-6">
          This class may have been removed or the link may be incorrect.
        </p>
        <Link
          to="/"
          className="inline-block px-4 py-2 bg-optio-purple text-white rounded-lg font-medium hover:opacity-90"
        >
          Back to Optio
        </Link>
      </div>
    )
  }

  const kickoff = formatKickoff(course.kickoff_at)
  const credit = formatCredit(course.credit_subject, course.credit_amount)
  const isStudentCurated = course.course_source === 'student_curated'

  const signupHref = inviteToken
    ? `/register?invite_token=${encodeURIComponent(inviteToken)}`
    : null

  return (
    <div className="bg-gray-50 min-h-screen">
      <Helmet>
        <title>{course.title} — Optio</title>
        {course.description && <meta name="description" content={course.description} />}
      </Helmet>

      {isPreview && (
        <div className="bg-yellow-50 border-b border-yellow-200">
          <div className="max-w-4xl mx-auto px-4 py-2 text-sm text-yellow-900 text-center">
            <span className="font-semibold">Preview</span>
            {course?.status && course.status !== 'published' && (
              <span> &middot; status: <span className="font-medium">{course.status.replace('_', ' ')}</span></span>
            )}
            <span className="ml-2 text-yellow-700">Only you and admins can see this until it's published.</span>
          </div>
        </div>
      )}
      {/* Header strip */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={OPTIO_LOGO_URL} alt="Optio" className="w-8 h-8" />
            <span className="font-semibold text-gray-900">Optio</span>
          </Link>
          <Link
            to="/how-it-works"
            className="text-sm text-optio-purple font-medium hover:underline"
          >
            New to Optio?
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-10">
        {/* Hero */}
        <section className="mb-10">
          {isStudentCurated && course.creator_name && (
            <p className="text-sm text-optio-purple font-semibold uppercase tracking-wide mb-2">
              Curated by {course.creator_name}
            </p>
          )}
          <h1 className="text-3xl sm:text-4xl font-bold text-gray-900 mb-3">
            {course.title}
          </h1>
          {course.description && (
            <p className="text-lg text-gray-700 whitespace-pre-wrap">{course.description}</p>
          )}
          {course.cover_image_url && (
            <img
              src={course.cover_image_url}
              alt=""
              className="mt-6 w-full max-h-80 object-cover rounded-xl"
            />
          )}
        </section>

        {/* Quick facts */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-10">
          {kickoff && (
            <div className="p-4 bg-white rounded-xl border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Kickoff call</div>
              <div className="font-medium text-gray-900">{kickoff}</div>
              <div className="text-xs text-gray-500 mt-1">Required for all students and parents</div>
            </div>
          )}
          {credit && (
            <div className="p-4 bg-white rounded-xl border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Earn</div>
              <div className="font-medium text-gray-900">{credit}</div>
              <div className="text-xs text-gray-500 mt-1">On full completion of every activity</div>
            </div>
          )}
          {course.quest_count != null && (
            <div className="p-4 bg-white rounded-xl border border-gray-200">
              <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Activities</div>
              <div className="font-medium text-gray-900">
                {course.quest_count} {course.quest_count === 1 ? 'quest' : 'quests'}
              </div>
            </div>
          )}
        </section>

        {/* Teacher of record — sourced from platform settings (same teacher across all classes) */}
        {isStudentCurated && teacherSettings && (teacherSettings.teacher_bio || teacherSettings.teacher_name) && (
          <section className="mb-10 p-6 bg-white rounded-xl border border-gray-200">
            <div className="text-xs text-gray-500 uppercase tracking-wide mb-1">Teacher of record</div>
            {teacherSettings.teacher_name && (
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{teacherSettings.teacher_name}</h2>
            )}
            {teacherSettings.teacher_credentials && (
              <p className="text-sm text-gray-600 mb-3">{teacherSettings.teacher_credentials}</p>
            )}
            {teacherSettings.teacher_bio && (
              <p className="text-gray-700 whitespace-pre-wrap">{teacherSettings.teacher_bio}</p>
            )}
            <p className="text-xs text-gray-500 mt-4">
              All student work is evaluated by the teacher of record before credit is awarded.
            </p>
          </section>
        )}

        {/* Activities */}
        {course.quests && course.quests.length > 0 && (
          <section className="mb-10">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">What you'll do together</h2>
            <ol className="space-y-3">
              {course.quests.map((q, idx) => (
                <li
                  key={q.id}
                  className="p-4 bg-white rounded-xl border border-gray-200"
                >
                  <div className="flex items-start gap-3">
                    <span className="text-gray-400 font-mono text-sm flex-shrink-0 pt-0.5">
                      {idx + 1}.
                    </span>
                    <div>
                      <h3 className="font-medium text-gray-900">{q.title}</h3>
                      {q.description && (
                        <p className="text-sm text-gray-600 mt-1">{q.description}</p>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {/* Sign-up CTA */}
        <section className="mb-10 p-6 rounded-xl bg-gradient-to-r from-optio-purple to-optio-pink text-white">
          {inviteError ? (
            <>
              <h2 className="text-xl font-semibold mb-2">This invite link isn't valid</h2>
              <p className="opacity-90 mb-2">{inviteError}</p>
              <p className="text-sm opacity-80">
                Ask {course.creator_name || 'the class creator'} for a new invite link.
              </p>
            </>
          ) : signupHref ? (
            <>
              {invitePreview?.inviter_name && (
                <p className="text-sm opacity-90 mb-1">
                  {invitePreview.inviter_name} invited you to join this class.
                </p>
              )}
              <h2 className="text-2xl font-bold mb-3">Ready to sign up?</h2>
              <p className="opacity-90 mb-4">
                You'll create an Optio account and be added to this class. A parent or guardian's
                email is required — they'll be invited to the mandatory kickoff call.
              </p>
              <Link
                to={signupHref}
                className="inline-block px-6 py-3 bg-white text-optio-purple rounded-lg font-semibold hover:bg-gray-50"
              >
                Sign up for this class
              </Link>
            </>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2">Want to join?</h2>
              <p className="opacity-90">
                Ask {course.creator_name || 'the class creator'} for an invite link. You'll need it
                to sign up.
              </p>
            </>
          )}
        </section>

        <p className="text-xs text-gray-500 text-center">
          In-person meetups (field trips, activities) are organized by the students and their
          parents and are not Optio activities. By signing up, you agree to
          Optio's{' '}
          <Link to="/terms" className="underline">Terms of Service</Link>.
        </p>
      </main>
    </div>
  )
}

export default PublicClassPage
