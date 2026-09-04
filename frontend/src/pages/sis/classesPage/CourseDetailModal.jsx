/**
 * Extracted from sis/ClassesPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import Button from '../../../components/ui/Button'
import CourseEnrollmentManager from '../../../components/admin/CourseEnrollmentManager'
import CoursePreviewModal from '../../../components/course/CoursePreviewModal'
import { ModalOverlay } from '../../../components/ui'
import SearchSelect from '../../../components/ui/SearchSelect'
import api from '../../../services/api'
import { toast } from 'react-hot-toast'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import OPTIO_COURSE_FEE from './OPTIO_COURSE_FEE'
import stripHtml from './stripHtml'
import COURSE_TABS from './COURSE_TABS'

const CourseDetailModal = ({ course, staff, current, orgId, isSuperadmin, onClose, onSaved }) => {
  const [tab, setTab] = useState('details')
  const [teacherId, setTeacherId] = useState(current?.teacher?.id || '')
  const [saving, setSaving] = useState(false)
  const [quests, setQuests] = useState([])
  const [viewingAsStudent, setViewingAsStudent] = useState(false)

  // Courses are built from Projects (quests) — list what's inside.
  useEffect(() => {
    api.get(`/api/courses/${course.id}/quests`)
      .then((r) => setQuests((r.data?.quests || []).filter((q) => q.is_published !== false)))
      .catch(() => setQuests([]))
  }, [course.id])

  const dirty = (teacherId || '') !== (current?.teacher?.id || '')

  const save = async () => {
    setSaving(true)
    try {
      await api.put(`/api/sis/courses/${course.id}/settings`, {
        teacher_id: teacherId || null,
        organization_id: orgId,
      })
      toast.success('Course updated')
      onSaved()
    } catch (e) {
      toast.error(e?.response?.data?.error || 'Could not update course')
    } finally {
      setSaving(false)
    }
  }

  if (viewingAsStudent) {
    return <CoursePreviewModal courseId={course.id} onClose={() => setViewingAsStudent(false)} />
  }

  return (
    <ModalOverlay onClose={onClose}>
      {/* one fixed size for every tab — wide enough for the enrollment tables */}
      <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {course.cover_image_url && (
          <img src={course.cover_image_url} alt="" className="w-full h-36 object-cover shrink-0" />
        )}
        <div className="flex items-center justify-between px-4 pt-4 shrink-0">
          <h2 className="text-lg font-semibold text-gray-900">{course.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>
        <div className="flex gap-4 px-4 mt-2 border-b border-gray-200 shrink-0">
          {COURSE_TABS.map((t) => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`pb-2.5 px-1 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key ? 'border-optio-purple text-optio-purple' : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        <div className="p-4 overflow-y-auto flex-1">
          {tab === 'details' && (
            <div className="space-y-4">
              {course.description && <p className="text-sm text-neutral-600">{course.description}</p>}

              <div className="pt-3 border-t border-gray-100">
                <label className="block text-sm font-medium text-gray-700 mb-1">Teacher</label>
                <SearchSelect
                  value={teacherId}
                  onChange={setTeacherId}
                  options={staff}
                  getId={(s) => s.id}
                  getLabel={(s) => s.name}
                  placeholder="Search staff…"
                />
              </div>

              {quests.length > 0 && (
                <div className="pt-3 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700 mb-2">Projects in this course</p>
                  <ol className="space-y-2">
                    {quests.map((q, i) => (
                      <li key={q.id || i} className="flex gap-3 text-sm">
                        <span className="shrink-0 w-5 h-5 rounded-full bg-optio-purple/10 text-optio-purple text-[11px] font-bold flex items-center justify-center mt-0.5">
                          {i + 1}
                        </span>
                        <div className="min-w-0">
                          <p className="font-medium text-neutral-800">{q.title}</p>
                          {q.description && <p className="text-neutral-500 line-clamp-2">{stripHtml(q.description)}</p>}
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          )}

          {tab === 'manage' && (
            <div className="space-y-3">
              <div className="rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-3 py-2 text-xs text-neutral-700">
                Each student you enroll adds a <span className="font-semibold text-neutral-900">{OPTIO_COURSE_FEE}</span> charge that Optio invoices to the school.
              </div>
              <CourseEnrollmentManager embedded courseId={course.id} courseName={course.title}
                orgId={orgId} isSuperadmin={isSuperadmin} />
            </div>
          )}
        </div>

        {tab === 'details' && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 shrink-0">
            <button
              onClick={() => setViewingAsStudent(true)}
              className="mr-auto px-4 py-2 text-sm font-medium text-optio-purple border border-optio-purple/30 rounded-lg hover:bg-optio-purple/5 transition-colors"
            >
              View as student
            </button>
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm">
              Close
            </button>
            <Button size="sm" onClick={save} disabled={saving || !dirty}>
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        )}
      </div>
    </ModalOverlay>
  )
}

export default CourseDetailModal
