import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg } from './useSisOrg'
// Shared with the family upload page: one list of what a prior-learning upload
// accepts, so the office and a parent are never told different things.
import { isSupported, kindFor } from '../../utils/priorLearningFiles'


import ReceivedTranscriptForm from './priorLearning/ReceivedTranscriptForm'
import EvidenceList from './priorLearning/EvidenceList'
import AiSuggestion from './priorLearning/AiSuggestion'
import TranscriptStep from './priorLearning/TranscriptStep'
import ReviewForm from './priorLearning/ReviewForm'
import previewKindFor from './priorLearning/previewKindFor'
import LOW_CONFIDENCE from './priorLearning/LOW_CONFIDENCE'
import transcriptRows from './priorLearning/transcriptRows'
import parseCourseText from './priorLearning/parseCourseText'
import courseTotal from './priorLearning/courseTotal'
import creditsFromSuggestion from './priorLearning/creditsFromSuggestion'
export { default as previewKindFor } from './priorLearning/previewKindFor'
export { default as LOW_CONFIDENCE } from './priorLearning/LOW_CONFIDENCE'
export { default as transcriptRows } from './priorLearning/transcriptRows'
export { default as parseCourseText } from './priorLearning/parseCourseText'
export { default as courseTotal } from './priorLearning/courseTotal'
export { default as creditsFromSuggestion } from './priorLearning/creditsFromSuggestion'
/**
 * Prior Learning review (SIS console).
 *
 * The office's queue of guardian-submitted prior-learning records: what a family
 * says their child already learned, the evidence they attached, and the credit
 * decision. Accepting IS awarding — the two always happen in one thought ("yes,
 * and that's 1.0 math"), so the award boxes live inside the accept action rather
 * than behind a second screen.
 *
 * ADMIN_ROLES on the backend (front-office paperwork, not money), so a campus
 * coordinator runs this alongside registration and attendance.
 *
 * Three steps, deliberately separate, because they are three different
 * decisions and collapsing them is how wrong numbers reach a transcript:
 *
 *   Analyze   the model reads the evidence and PROPOSES a split. It writes
 *             nothing but ai_suggestion. The panel says "suggested" and every
 *             number in it is editable before it counts for anything.
 *   Accept    the office decides it believes the evidence, and awards credit
 *             on the record.
 *   Transcribe the credit becomes a transfer_credits row and moves the
 *             student's XP. This is the only step that touches a transcript,
 *             and it refuses to run twice on one record.
 *
 * "Use these numbers" copies a suggestion into the reviewer's own boxes. It is
 * a copy, not an application — the reviewer still presses Accept, so a
 * confident-but-wrong reading always passes through a person.
 *
 * The office can also FILE a record here, not only review one. Transcripts
 * arrive at the school directly — mailed, emailed, handed over at enrollment —
 * and before this an admin holding one either sat on it or asked the family to
 * upload a document the school already had. A record filed here opens in review
 * and is otherwise identical to a family's, and documents can be added to any
 * record afterwards, because the second page of a transcript turns up a week
 * late and belongs on the record it belongs on.
 */

const STATUS_TABS = [
  ['submitted', 'New'],
  ['under_review', 'In review'],
  ['accepted', 'Accepted'],
  ['rejected', 'Not accepted'],
]

const STATUS_STYLES = {
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-800',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const dateRange = (record) => (
  [record.started_on, record.ended_on].filter(Boolean).join(' – ') || null
)

const PriorLearningPage = () => {
  const { orgId } = useSisOrg()
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('submitted')
  const [records, setRecords] = useState([])
  const [counts, setCounts] = useState({})
  const [subjects, setSubjects] = useState([])
  const [openId, setOpenId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(null)
  const [suggested, setSuggested] = useState({})
  const [disabled, setDisabled] = useState(false)
  const [adding, setAdding] = useState(false)

  const query = useMemo(() => {
    const params = new URLSearchParams({ status })
    if (orgId) params.set('organization_id', orgId)
    return params.toString()
  }, [status, orgId])

  const load = useCallback(() => {
    setLoading(true)
    api.get(`/api/sis/prior-learning?${query}`)
      .then((r) => {
        setRecords(r.data?.records || [])
        setCounts(r.data?.counts || {})
        setSubjects(r.data?.subjects || [])
        setDisabled(false)
      })
      .catch((err) => {
        if (err.response?.status === 403) { setDisabled(true); return }
        toast.error('Could not load prior learning records')
      })
      .finally(() => setLoading(false))
  }, [query])

  useEffect(() => { load() }, [load])

  const review = async (recordId, payload) => {
    setBusy(true)
    try {
      await api.post(`/api/sis/prior-learning/${recordId}/review`,
        { organization_id: orgId || undefined, ...payload })
      setOpenId(null)
      // Accepting moves the record OUT of the tab it was reviewed in, which
      // used to take the unfinished "Add to transcript" step with it — the
      // record simply vanished and nothing said the credit had gone nowhere.
      // Follow it, so the remaining step is on screen instead of one tab away.
      if (payload.status === 'accepted' && Object.keys(payload.awarded_credits || {}).length) {
        toast.success('Credit awarded. Now add it to the transcript.')
        setStatus('accepted')
      } else {
        toast.success('Saved')
        load()
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save this review')
    } finally {
      setBusy(false)
    }
  }

  // Reads the evidence and writes ai_suggestion. Synchronous — the reviewer is
  // looking at the record and waits a few seconds, which beats a queue and a
  // poll for a call this short.
  // `passwords` unlock encrypted PDFs for this one call. They are never stored
  // — not in component state beyond the attempt, not on the record, not in the
  // response — so a reviewer retypes rather than the school holding a family's
  // document password.
  const analyze = async (recordId, passwords) => {
    setAnalyzing(recordId)
    try {
      const r = await api.post(`/api/sis/prior-learning/${recordId}/analyze`,
        { organization_id: orgId || undefined, passwords: passwords || undefined })
      setRecords((prev) => prev.map((rec) => (
        rec.id === recordId ? { ...rec, ai_suggestion: r.data?.suggestion } : rec
      )))
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not analyze this record')
    } finally {
      setAnalyzing(null)
    }
  }

  const deleteEvidence = async (recordId, evidenceId) => {
    setBusy(true)
    try {
      await api.delete(`/api/sis/prior-learning/${recordId}/evidence/${evidenceId}`,
        { params: { organization_id: orgId || undefined } })
      setRecords((prev) => prev.map((rec) => (
        rec.id === recordId
          ? { ...rec, evidence: (rec.evidence || []).filter((e) => e.id !== evidenceId) }
          : rec
      )))
      toast.success('Document deleted')
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not delete that document')
    } finally {
      setBusy(false)
    }
  }

  // Documents the office received itself, added to a record that already exists
  // — the rest of a transcript that arrived in two envelopes, or the official
  // copy the school sent to back up what a family scanned.
  const addDocuments = async (recordId, fileList) => {
    const all = Array.from(fileList || [])
    const files = all.filter(isSupported)
    const refused = all.filter((f) => !isSupported(f))
    if (refused.length) {
      toast.error(`Can’t use ${refused.map((f) => f.name).join(', ')} — try a PDF, a photo, or a CSV.`)
    }
    if (!files.length) return
    setBusy(true)
    const added = []
    const failed = []
    for (const file of files) {
      const data = new FormData()
      data.append('evidence_type', kindFor(file))
      data.append('file', file)
      if (orgId) data.append('organization_id', orgId)
      try {
        const r = await api.post(
          `/api/sis/prior-learning/${recordId}/evidence${orgId ? `?organization_id=${orgId}` : ''}`,
          data)
        if (r.data?.evidence) added.push(r.data.evidence)
      } catch (err) {
        failed.push({ name: file.name, reason: err.response?.data?.error })
      }
    }
    if (added.length) {
      setRecords((prev) => prev.map((rec) => (
        rec.id === recordId ? { ...rec, evidence: [...(rec.evidence || []), ...added] } : rec
      )))
      toast.success(added.length === 1 ? 'Document added' : `${added.length} documents added`)
    }
    if (failed.length) {
      toast.error(`Didn’t upload: ${failed
        .map((f) => (f.reason ? `${f.name} (${f.reason})` : f.name)).join(', ')}`)
    }
    setBusy(false)
  }

  // A new record lands in review, so follow it there — otherwise the thing the
  // reviewer just filed is on a tab they aren't looking at.
  const afterFiling = () => {
    setAdding(false)
    if (status === 'under_review') load()
    else setStatus('under_review')
  }

  // The only call that touches a transcript.
  const addToTranscript = async (recordId, payload) => {
    setBusy(true)
    try {
      const r = await api.post(`/api/sis/prior-learning/${recordId}/credit`,
        { organization_id: orgId || undefined, ...payload })
      toast.success(r.data?.action === 'merged'
        ? 'Added to this school’s existing transfer credit'
        : 'Added to the transcript')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add this to the transcript')
    } finally {
      setBusy(false)
    }
  }

  if (disabled) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-bold text-gray-900 font-poppins">Prior Learning</h1>
        <p className="text-sm text-gray-600 mt-2">
          Prior learning records aren’t enabled for this school.
        </p>
      </div>
    )
  }

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-gray-900 font-poppins">Prior Learning</h1>
          <p className="text-sm text-gray-600 mt-1">
            Learning students did before or outside Optio, with evidence, for
            high-school credit — sent by a family or received by the office.
          </p>
        </div>
        <button type="button" onClick={() => setAdding(true)}
                className="shrink-0 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink">
          Upload a transcript
        </button>
      </div>

      {adding && (
        <ReceivedTranscriptForm orgId={orgId} onClose={() => setAdding(false)}
                                onFiled={afterFiling} />
      )}

      <div className="flex flex-wrap gap-2">
        {STATUS_TABS.map(([key, label]) => (
          <button key={key} type="button" onClick={() => setStatus(key)}
                  className={`text-sm px-3 py-1.5 rounded-full border ${
                    status === key
                      ? 'border-optio-purple text-optio-purple bg-purple-50'
                      : 'border-gray-300 text-gray-600'}`}>
            {label}{counts[key] ? ` (${counts[key]})` : ''}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && !records.length && (
        <p className="text-sm text-gray-500">Nothing here.</p>
      )}

      <div className="space-y-4">
        {records.map((record) => (
          <div key={record.id} className="bg-white rounded-xl border border-gray-200 p-5 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-semibold text-gray-900">{record.title}</h2>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[record.status]}`}>
                    {record.status.replace('_', ' ')}
                  </span>
                  {/* Accepted-and-awarded but not yet transcribed reads as
                      "done" from the status alone, and it is the state where
                      the credit exists but the student has none of it. */}
                  {record.status === 'accepted' && !record.transfer_credit
                    && Object.keys(record.awarded_credits || {}).length > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      not on transcript
                    </span>
                  )}
                  {/* Where it came from, because "who filed this" is a question
                      an accreditor asks, and a staff record has no family
                      behind it to ask about a missing page. */}
                  {record.source === 'staff' && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                      filed by the office
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-500 mt-0.5">
                  {[record.student_name, record.provider, dateRange(record),
                    record.hours_estimate ? `${record.hours_estimate} hrs` : null]
                    .filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button type="button" disabled={analyzing === record.id}
                        onClick={() => analyze(record.id)}
                        className="text-sm text-gray-600 font-medium disabled:opacity-50">
                  {analyzing === record.id ? 'Reading…'
                    : record.ai_suggestion ? 'Re-analyze' : 'Analyze evidence'}
                </button>
                <button type="button" onClick={() => setOpenId(openId === record.id ? null : record.id)}
                        className="text-sm text-optio-purple font-medium">
                  {openId === record.id ? 'Close' : 'Review'}
                </button>
              </div>
            </div>

            {record.description && (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{record.description}</p>
            )}

            <EvidenceList evidence={record.evidence} busy={busy}
                          onAdd={(files) => addDocuments(record.id, files)}
                          onDelete={(evidenceId) => deleteEvidence(record.id, evidenceId)} />

            {record.ai_suggestion && (
              <AiSuggestion
                suggestion={record.ai_suggestion}
                busy={analyzing === record.id}
                onUnlock={(password) => analyze(record.id, [password])}
                onUse={() => {
                  setSuggested({ ...suggested, [record.id]: record.ai_suggestion })
                  setOpenId(record.id)
                }}
              />
            )}

            {openId === record.id && (
              <ReviewForm record={record} subjects={subjects} busy={busy}
                          prefill={suggested[record.id]}
                          onSubmit={(payload) => review(record.id, payload)} />
            )}

            {record.status === 'accepted' && (
              <TranscriptStep record={record} busy={busy}
                              suggestion={record.ai_suggestion}
                              onSubmit={(payload) => addToTranscript(record.id, payload)} />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

export default PriorLearningPage
