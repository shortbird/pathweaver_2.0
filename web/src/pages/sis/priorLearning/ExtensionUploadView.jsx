import React, { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import ReceivedTranscriptForm from './ReceivedTranscriptForm'

/**
 * Prior Learning for an extension of Optio Academy (accreditation_source
 * 'optio'): the school's students get Optio Academy diplomas, so Optio Academy
 * reviews their prior learning and puts the credit on the transcript.
 *
 * The school's office therefore gets no review queue — no Analyze, no Review,
 * no transcript step. It uploads, and it watches each upload move through
 * Optio's review: Sent, In review, Decision, On transcript. Family uploads from
 * the school page show here too, so the office can answer "where is it".
 */

const STEPS = ['Sent', 'In review', 'Decision', 'On transcript']

/** How far along Optio's review a record is, as an index into STEPS. */
export const stepFor = (record) => {
  if (record.status === 'accepted') return record.transfer_credit ? 3 : 2
  if (record.status === 'rejected') return 2
  if (record.status === 'under_review') return 1
  return 0
}

const formatDate = (iso) => (iso
  ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  : '')

export const ReviewProgress = ({ record }) => {
  const reached = stepFor(record)
  const rejected = record.status === 'rejected'
  const labels = STEPS.map((label, i) => (i === 2 && reached >= 2
    ? (rejected ? 'Not accepted' : 'Accepted')
    : label))
  return (
    <div aria-label={`Optio Academy review: ${labels[reached]}`}>
      <div className="grid grid-cols-4 gap-1">
        {STEPS.map((label, i) => {
          const done = i <= reached && !(rejected && i > 2)
          const tone = rejected && i === 2 ? 'bg-red-500' : done ? 'bg-optio-purple' : 'bg-gray-200'
          return <div key={label} className={`h-2 rounded-full ${tone}`} />
        })}
      </div>
      <div className="grid grid-cols-4 gap-1 mt-1.5">
        {labels.map((label, i) => (
          <span key={STEPS[i]}
                className={`text-xs ${i === reached ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
            {rejected && i === 3 ? '' : label}
          </span>
        ))}
      </div>
    </div>
  )
}

const ExtensionUploadView = ({ orgId }) => {
  const [records, setRecords] = useState([])
  const [subjects, setSubjects] = useState({})
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)

  const load = useCallback(() => {
    // No status filter: every upload the school has sent, newest first.
    api.get(`/api/sis/prior-learning${orgId ? `?organization_id=${orgId}` : ''}`)
      .then((r) => {
        setRecords(r.data?.records || [])
        setSubjects(Object.fromEntries((r.data?.subjects || []).map((s) => [s.key, s.name])))
      })
      .catch(() => toast.error('Could not load your uploads'))
      .finally(() => setLoading(false))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const credits = (record) => Object.entries(record.awarded_credits || {})
    .map(([key, value]) => `${value} ${subjects[key] || key}`).join(' · ')

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-poppins">Prior Learning</h1>
          <p className="text-sm text-gray-600 mt-1">
            Send transcripts and records of learning from before your school. Optio Academy
            reviews them and adds the credit to the student’s transcript.
          </p>
        </div>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
                  className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-primary">
            Upload a transcript
          </button>
        )}
      </div>

      {adding && (
        <ReceivedTranscriptForm
          orgId={orgId}
          heading="Send a transcript to Optio Academy"
          intro="Choose the student and add every page. Optio Academy reviews it and shows its progress below."
          submitLabel="Send to Optio Academy"
          onClose={() => setAdding(false)}
          onFiled={() => { setAdding(false); load() }}
        />
      )}

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && !records.length && (
        <p className="text-sm text-gray-500">Nothing sent yet.</p>
      )}

      <div className="space-y-4">
        {records.map((record) => (
          <div key={record.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div>
              <h2 className="font-semibold text-gray-900">{record.title}</h2>
              <p className="text-sm text-gray-500 mt-0.5">
                {[record.student_name,
                  record.source === 'family' ? 'sent by the family' : 'sent by the school',
                  formatDate(record.created_at)].filter(Boolean).join(' · ')}
              </p>
            </div>

            <ReviewProgress record={record} />

            {record.status === 'accepted' && credits(record) && (
              <p className="text-sm text-gray-700">Credit awarded: {credits(record)}</p>
            )}
            {record.review_notes && ['accepted', 'rejected'].includes(record.status) && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">
                <span className="font-medium">Note from Optio Academy: </span>{record.review_notes}
              </p>
            )}

            {(record.evidence || []).length > 0 && (
              <ul className="flex flex-wrap gap-2">
                {record.evidence.map((item) => (
                  <li key={item.id}>
                    <a href={item.url} target="_blank" rel="noreferrer"
                       className="text-xs px-2 py-1 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200">
                      {item.file_name || item.title || 'Document'}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default ExtensionUploadView
