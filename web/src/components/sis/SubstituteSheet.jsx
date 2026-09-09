import React, { useEffect, useState } from 'react'
import api from '../../services/api'
import ModalOverlay from '../ui/ModalOverlay'
import { withOrg } from '../../pages/sis/useSisOrg'
import { meetingText } from './classLabel'

/**
 * One page a substitute can be handed.
 *
 * iCreate, 2026-08-27 (7effb6a2): "Can we make a way for someone who is subbing
 * a class to be able to see the class for the day to know the students,
 * curriculum, and location?"
 *
 * Deliberately a printable sheet rather than an account. A sub is often not in
 * the system at all, and the ones who are should not be given a login to
 * somebody else's class for one morning. (A sub who WILL be around a while goes
 * on the class as an assistant teacher, which already gives them the class in
 * their own portal.)
 *
 * Everything on it is already loaded for the class page except the curriculum,
 * which is one request made when the sheet is opened.
 */
export default function SubstituteSheet({ classId, cls, students = [], orgId, onClose }) {
  const [curriculum, setCurriculum] = useState(null)

  useEffect(() => {
    api.get(withOrg(`/api/sis/classes/${classId}/curriculum`, orgId))
      .then((r) => setCurriculum(r.data?.curriculum || []))
      .catch(() => setCurriculum([]))
  }, [classId, orgId])

  const when = meetingText(cls?.meetings)
  const room = cls?.location

  return (
    <ModalOverlay onClose={onClose}>
      <div className="w-full max-w-2xl max-h-[calc(100vh-2rem)] flex flex-col rounded-2xl bg-white shadow-xl"
        role="dialog" aria-modal="true" aria-label="Substitute sheet">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-200 shrink-0 sis-no-print">
          <h2 className="font-semibold text-neutral-900">Substitute sheet</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => window.print()}
              className="px-3 py-1.5 rounded-lg border border-gray-300 text-sm text-neutral-700 hover:bg-gray-50">
              Print
            </button>
            <button onClick={onClose} aria-label="Close"
              className="text-neutral-400 hover:text-neutral-600 text-lg px-1">×</button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 space-y-5">
          <div>
            <h3 className="text-lg font-bold text-neutral-900">{cls?.name}</h3>
            <p className="text-sm text-neutral-600">
              {[when, room ? `Room: ${room}` : 'No room set'].filter(Boolean).join(' · ')}
            </p>
            {cls?.primary_instructor_name && (
              <p className="text-xs text-neutral-500">Usually taught by {cls.primary_instructor_name}</p>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-neutral-800 mb-1">
              Students ({students.length})
            </h4>
            {students.length === 0 ? (
              <p className="text-sm text-neutral-500">Nobody enrolled.</p>
            ) : (
              <ol className="text-sm text-neutral-800 columns-2 gap-6">
                {students.map((s) => (
                  <li key={s.student_id} className="break-inside-avoid">
                    {s.name}
                    {/* A sub has to know about an allergy before they hand out
                        snacks, and this sheet may be the only thing they read. */}
                    {s.health_alert && (
                      <span className="ml-1 text-xs font-medium text-red-600">
                        {s.health_alert}
                      </span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <h4 className="text-sm font-semibold text-neutral-800 mb-1">What they are working on</h4>
            {curriculum === null && <p className="text-sm text-neutral-400">Loading…</p>}
            {curriculum?.length === 0 && (
              <p className="text-sm text-neutral-500">
                No curriculum attached to this class — ask the office what to cover.
              </p>
            )}
            {(curriculum || []).map((c) => (
              <div key={c.id || c.curriculum_id} className="mb-2">
                <p className="text-sm font-medium text-neutral-800">{c.title}</p>
                {c.description && (
                  <p className="text-sm text-neutral-600 whitespace-pre-wrap">{c.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalOverlay>
  )
}
