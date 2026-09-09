import React, { useEffect, useMemo, useState } from 'react'
import toast from 'react-hot-toast'
import api from '../../services/api'
import { MagnifyingGlassIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

const BLANK_FORM = {
  first_name: '',
  last_name: '',
  student_email: '',
  date_of_birth: ''
}

const STATUS_LABELS = {
  enrolled: 'Enrolled',
  reactivated: 'Re-enrolled',
  already_enrolled: 'Already enrolled',
  failed: 'Could not enroll'
}

// College/dual-credit course codes like "HIST 1301", "ENGL 1302", "English 2322"
const COURSE_CODE_RE = /^[A-Za-z]{2,8}\s\d{3,4}\b/

/**
 * Courses the partner can sell to homeschool families: published, public,
 * project-based enrichment courses. Excludes org-only academic classes, any
 * credit-bearing class (e.g. "Python 1"), and college course-code titles.
 */
const isSelectableCourse = (course, orgId) =>
  course.status === 'published' &&
  course.visibility === 'public' &&
  course.organization_id !== orgId &&
  !course.credit_subject &&
  !COURSE_CODE_RE.test((course.title || '').trim())

/**
 * EnrollStudentForm
 *
 * Form for a partner org_admin to register a student and enroll them in one or
 * more Optio courses. Creates a new account (temp password emailed to the
 * student) or, for a returning student already in the org, enrolls their
 * existing account in the newly selected courses.
 *
 * Props:
 *   orgId        - organization id to register the student into
 *   onRegistered - optional callback fired after a successful registration
 */
export default function EnrollStudentForm({ orgId, onRegistered, initialCourseIds = [] }) {
  const [courses, setCourses] = useState([])
  const [loadingCourses, setLoadingCourses] = useState(true)
  const [form, setForm] = useState(BLANK_FORM)
  const [selected, setSelected] = useState(initialCourseIds)
  const [courseSearch, setCourseSearch] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null)

  useEffect(() => {
    let active = true
    const fetchCourses = async () => {
      try {
        setLoadingCourses(true)
        const res = await api.get('/api/courses?filter=all')
        const all = res.data.courses || []
        const selectable = all.filter(c => isSelectableCourse(c, orgId))
        if (active) setCourses(selectable)
      } catch (err) {
        if (active) toast.error('Failed to load courses')
      } finally {
        if (active) setLoadingCourses(false)
      }
    }
    fetchCourses()
    return () => { active = false }
  }, [orgId])

  const filteredCourses = useMemo(() => {
    const q = courseSearch.trim().toLowerCase()
    if (!q) return courses
    return courses.filter(c => c.title?.toLowerCase().includes(q))
  }, [courses, courseSearch])

  const update = (key, value) => setForm(prev => ({ ...prev, [key]: value }))
  const toggleCourse = (id) =>
    setSelected(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.first_name.trim()) return setError('First name is required')
    if (!form.last_name.trim()) return setError('Last name is required')
    if (!form.student_email.trim()) return setError('Student email is required')
    if (selected.length === 0) return setError('Select at least one course')
    if (!orgId) return setError('No organization is associated with your account')

    setSubmitting(true)
    try {
      const res = await api.post(`/api/admin/organizations/${orgId}/register-student-for-course`, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        student_email: form.student_email.trim().toLowerCase(),
        date_of_birth: form.date_of_birth || undefined,
        course_ids: selected
      })
      setResult({ ...res.data, studentName: `${form.first_name} ${form.last_name}`.trim() })
      if (onRegistered) onRegistered(res.data)
    } catch (err) {
      const d = err.response?.data?.error || err.response?.data?.message || err.response?.data
      setError(typeof d === 'string' ? d : d?.message || 'Failed to register student')
    } finally {
      setSubmitting(false)
    }
  }

  const registerAnother = () => {
    setForm(BLANK_FORM)
    setSelected([])
    setCourseSearch('')
    setError('')
    setResult(null)
  }

  // ---- Success view ----
  if (result) {
    const courseResults = result.courses || []
    const isNew = result.is_new_account
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <div className="flex items-center gap-3 mb-4">
          <CheckCircleIcon className="w-8 h-8 text-green-600 shrink-0" />
          <div>
            <h2 className="text-xl font-bold text-gray-900">
              {result.studentName} is {isNew ? 'registered' : 'enrolled'}
            </h2>
            <p className="text-sm text-gray-600">{result.message}</p>
          </div>
        </div>

        <div className="border border-gray-100 rounded-lg divide-y divide-gray-100 mb-4">
          {courseResults.map(c => (
            <div key={c.course_id} className="flex items-center justify-between px-4 py-2.5">
              <span className="text-sm text-gray-900">{c.course_title}</span>
              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${c.status === 'failed' ? 'bg-red-50 text-red-700' : c.status === 'already_enrolled' ? 'bg-gray-100 text-gray-600' : 'bg-green-50 text-green-700'}`}>
                {STATUS_LABELS[c.status] || c.status}
              </span>
            </div>
          ))}
        </div>

        <div className={`rounded-lg p-3 mb-4 text-sm border ${result.email_sent ? 'bg-green-50 border-green-200 text-green-800' : 'bg-yellow-50 border-yellow-200 text-yellow-800'}`}>
          {result.email_sent
            ? <>A {isNew ? 'welcome' : 'notification'} email with everything they need was sent to <strong>{result.email_to}</strong>.</>
            : isNew
              ? <>The account was created, but the welcome email to <strong>{result.email_to}</strong> could not be sent. Ask the student to use the "Forgot password" link on the login page to get in.</>
              : <>The student was enrolled, but the notification email to <strong>{result.email_to}</strong> could not be sent.</>}
        </div>

        <button
          onClick={registerAnother}
          className="w-full px-4 py-2.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 font-medium"
        >
          Register Another Student
        </button>
      </div>
    )
  }

  // ---- Form view ----
  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <label className="block text-sm font-medium mb-1">First Name <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.first_name}
            onChange={(e) => update('first_name', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
            placeholder="Jordan"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Last Name <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={form.last_name}
            onChange={(e) => update('last_name', e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
            placeholder="Rivera"
          />
        </div>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Student Email <span className="text-red-500">*</span></label>
        <input
          type="email"
          value={form.student_email}
          onChange={(e) => update('student_email', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          placeholder="student@example.com"
        />
        <p className="text-xs text-gray-500 mt-1">This becomes the student's login, and where the welcome email is sent.</p>
      </div>

      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">Date of Birth <span className="text-gray-400">(optional)</span></label>
        <input
          type="date"
          value={form.date_of_birth}
          onChange={(e) => update('date_of_birth', e.target.value)}
          className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
        />
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-1">
          <label className="block text-sm font-medium">
            Courses <span className="text-red-500">*</span>
          </label>
          <span className="text-xs text-gray-500">{selected.length} selected</span>
        </div>

        <div className="relative mb-2">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={courseSearch}
            onChange={(e) => setCourseSearch(e.target.value)}
            placeholder="Search courses..."
            className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple outline-none"
          />
        </div>

        <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-gray-100">
          {loadingCourses ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">Loading courses...</div>
          ) : filteredCourses.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-500">No courses found</div>
          ) : (
            filteredCourses.map(course => (
              <label key={course.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={selected.includes(course.id)}
                  onChange={() => toggleCourse(course.id)}
                  className="w-4 h-4 rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                />
                <span className="text-sm text-gray-900">{course.title}</span>
              </label>
            ))
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full px-4 py-2.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 disabled:opacity-50 font-medium"
      >
        {submitting ? 'Registering...' : 'Register & Enroll'}
      </button>
    </form>
  )
}
