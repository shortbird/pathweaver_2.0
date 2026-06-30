import React, { useState, useEffect, useCallback } from 'react'
import { CheckCircleIcon } from '@heroicons/react/24/outline'
import { toast } from 'react-hot-toast'
import classService from '../../services/classService'

/**
 * ClassAttendanceTab - Teacher marks absences for a class meeting (iCreate SIS).
 *
 * There is no student check-in/check-out: everyone defaults to present and the
 * teacher flags who is absent (or excused), then saves. Marking a student absent
 * notifies their parent; changing present -> absent also notifies the org admin.
 */

const STATUS_OPTIONS = [
  { value: 'present', label: 'Present' },
  { value: 'absent', label: 'Absent' },
  { value: 'excused', label: 'Excused' },
]

// Local date as YYYY-MM-DD (avoids the UTC shift toISOString() would introduce)
function todayLocalISO() {
  const d = new Date()
  const offsetMs = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 10)
}

function studentName(student) {
  if (!student) return 'Student'
  return (
    student.display_name ||
    [student.first_name, student.last_name].filter(Boolean).join(' ') ||
    student.email ||
    'Student'
  )
}

export default function ClassAttendanceTab({ orgId, classId, classData }) {
  const [meetingDate, setMeetingDate] = useState(todayLocalISO())
  const [roster, setRoster] = useState([])
  const [statuses, setStatuses] = useState({}) // student_id -> status
  const [recorded, setRecorded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const fetchAttendance = useCallback(async () => {
    try {
      setLoading(true)
      const response = await classService.getAttendance(orgId, classId, meetingDate)
      if (response.success) {
        const students = response.attendance?.students || []
        setRoster(students)
        // Unrecorded students default to present.
        const initial = {}
        students.forEach((s) => {
          initial[s.student_id] = s.status || 'present'
        })
        setStatuses(initial)
        setRecorded(!!response.attendance?.recorded)
      } else {
        toast.error(response.error || 'Failed to load attendance')
      }
    } catch (error) {
      console.error('Failed to fetch attendance:', error)
      toast.error('Failed to load attendance')
    } finally {
      setLoading(false)
    }
  }, [orgId, classId, meetingDate])

  useEffect(() => {
    fetchAttendance()
  }, [fetchAttendance])

  const setStatus = (studentId, status) => {
    setStatuses((prev) => ({ ...prev, [studentId]: status }))
  }

  const markAllPresent = () => {
    const all = {}
    roster.forEach((s) => {
      all[s.student_id] = 'present'
    })
    setStatuses(all)
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const records = roster.map((s) => ({
        student_id: s.student_id,
        status: statuses[s.student_id] || 'present',
      }))
      const response = await classService.markAttendance(orgId, classId, meetingDate, records)
      if (response.success) {
        const { absent = 0, parents_notified = 0, org_admins_notified = 0 } = response.summary || {}
        let msg = 'Attendance saved'
        if (absent > 0) {
          const parts = []
          if (parents_notified > 0) parts.push(`${parents_notified} parent${parents_notified === 1 ? '' : 's'}`)
          if (org_admins_notified > 0) parts.push(`${org_admins_notified} admin${org_admins_notified === 1 ? '' : 's'}`)
          msg = parts.length ? `Attendance saved — notified ${parts.join(' and ')}` : 'Attendance saved'
        }
        toast.success(msg)
        fetchAttendance()
      } else {
        toast.error(response.error || 'Failed to save attendance')
      }
    } catch (error) {
      console.error('Failed to save attendance:', error)
      toast.error(error.response?.data?.error || 'Failed to save attendance')
    } finally {
      setSaving(false)
    }
  }

  const absentCount = roster.filter((s) => statuses[s.student_id] === 'absent').length

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <label htmlFor="attendance-date" className="block text-xs font-medium text-gray-500 mb-1">
            Meeting date
          </label>
          <input
            id="attendance-date"
            type="date"
            value={meetingDate}
            onChange={(e) => setMeetingDate(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-optio-purple focus:border-transparent"
          />
        </div>

        {recorded && (
          <span className="self-end mb-1 inline-flex items-center gap-1.5 px-2.5 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium">
            <CheckCircleIcon className="w-4 h-4" />
            Recorded
          </span>
        )}

        <div className="ml-auto flex items-end gap-2">
          <button
            onClick={markAllPresent}
            disabled={loading || roster.length === 0}
            className="px-3 py-2 text-sm border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
          >
            Mark all present
          </button>
          <button
            onClick={handleSave}
            disabled={saving || loading || roster.length === 0}
            className="px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save attendance'}
          </button>
        </div>
      </div>

      {/* Roster */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple"></div>
          <span className="ml-3 text-gray-500">Loading roster...</span>
        </div>
      ) : roster.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <p className="text-gray-500">No students are enrolled in this class yet</p>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <h3 className="text-sm font-medium text-gray-700">
              {roster.length} student{roster.length === 1 ? '' : 's'}
            </h3>
            <span className="text-sm text-gray-500">
              {absentCount} marked absent
            </span>
          </div>

          {roster.map((s) => {
            const current = statuses[s.student_id] || 'present'
            return (
              <div
                key={s.student_id}
                className="flex items-center justify-between gap-4 p-3 bg-white border border-gray-200 rounded-lg"
              >
                <span className="font-medium text-gray-900 truncate">
                  {studentName(s.student)}
                </span>
                <div className="flex items-center gap-1 flex-shrink-0" role="group" aria-label={`Attendance for ${studentName(s.student)}`}>
                  {STATUS_OPTIONS.map((opt) => {
                    const active = current === opt.value
                    const activeColor =
                      opt.value === 'absent'
                        ? 'bg-red-600 text-white border-red-600'
                        : opt.value === 'excused'
                          ? 'bg-amber-500 text-white border-amber-500'
                          : 'bg-green-600 text-white border-green-600'
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        aria-pressed={active}
                        onClick={() => setStatus(s.student_id, opt.value)}
                        className={`px-3 py-1.5 text-sm border rounded-lg transition-colors ${
                          active ? activeColor : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
