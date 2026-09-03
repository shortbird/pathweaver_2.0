import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { useSisOrg } from './useSisOrg'
import { useConfirm } from '../../contexts/ConfirmContext'
// Shared with the family upload page: one list of what a prior-learning upload
// accepts, so the office and a parent are never told different things.
import {
  ACCEPT_ATTR, MAX_FILES, isSupported, kindFor, prettySize,
} from '../../utils/priorLearningFiles'

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

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

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

/**
 * The office filing a record itself: a transcript that came from the school it
 * came from, not from the family.
 *
 * One panel, one save. It creates the record and uploads every file behind that
 * one press, because "create the record, then attach the documents" is two
 * steps that only exist for the database's benefit — a half-filed record with
 * no evidence is worth nothing to anybody.
 *
 * The record opens in review (the office is already looking at it), so it is
 * immediately analyzable, acceptable and transcribable like any other.
 */
const ReceivedTranscriptForm = ({ orgId, onClose, onFiled }) => {
  const [students, setStudents] = useState(null)   // null while loading
  const [studentId, setStudentId] = useState('')
  const [school, setSchool] = useState('')
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [staged, setStaged] = useState([])
  const [dragging, setDragging] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    api.get(`/api/sis/prior-learning/students${orgId ? `?organization_id=${orgId}` : ''}`)
      .then((r) => setStudents(r.data?.students || []))
      .catch(() => { setStudents([]); toast.error('Could not load the student list') })
  }, [orgId])

  const addFiles = (fileList) => {
    const all = Array.from(fileList || [])
    if (!all.length) return
    const incoming = all.filter(isSupported)
    const refused = all.filter((f) => !isSupported(f))
    if (refused.length) {
      toast.error(`Can’t use ${refused.map((f) => f.name).join(', ')} — try a PDF, a photo, or a CSV.`)
    }
    if (!incoming.length) return
    setStaged((current) => {
      const room = MAX_FILES - current.length
      if (room <= 0) {
        toast.error(`You can upload ${MAX_FILES} documents at a time`)
        return current
      }
      if (incoming.length > room) {
        toast.error(`Only the first ${room} were added — ${MAX_FILES} at a time`)
      }
      return [...current, ...incoming.slice(0, room)]
    })
  }

  const save = async () => {
    if (!studentId) { toast.error('Choose which student this is for'); return }
    if (!staged.length) { toast.error('Add at least one document'); return }
    setSaving(true)
    try {
      // Never an untitled row in the queue: the school's name is what a
      // reviewer scanning the list actually recognizes, so it is the fallback
      // before the file name.
      const named = title.trim()
        || (school.trim() ? `Transcript from ${school.trim()}` : staged[0].name)
      const created = await api.post('/api/sis/prior-learning', {
        organization_id: orgId || undefined,
        student_user_id: studentId,
        title: named,
        provider: school.trim() || undefined,
        description: note.trim() || undefined,
      })
      const recordId = created.data?.record?.id
      if (!recordId) throw new Error('no record')

      const failed = []
      for (const file of staged) {
        const data = new FormData()
        data.append('evidence_type', kindFor(file))
        data.append('file', file)
        if (orgId) data.append('organization_id', orgId)
        try {
          await api.post(
            `/api/sis/prior-learning/${recordId}/evidence${orgId ? `?organization_id=${orgId}` : ''}`,
            data)
        } catch (err) {
          failed.push({ name: file.name, reason: err.response?.data?.error })
        }
      }

      if (failed.length === staged.length) {
        // The record exists and is in the queue with nothing on it. Say so, and
        // leave it visible — "+ Add a document" on the card is how it's fixed,
        // and claiming success over an empty record is how it gets forgotten.
        toast.error(failed[0].reason
          ? `Record created, but nothing uploaded — ${failed[0].reason}`
          : 'Record created, but no document uploaded. Add one from the record.')
      } else if (failed.length) {
        toast.error(`Uploaded, except: ${failed
          .map((f) => (f.reason ? `${f.name} (${f.reason})` : f.name)).join(', ')}`)
      } else {
        toast.success(staged.length === 1 ? 'Transcript filed' : `${staged.length} documents filed`)
      }
      onFiled()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not file this record')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-gray-900">Upload a transcript you received</h2>
          <p className="text-sm text-gray-600 mt-0.5">
            For paperwork that came to the school directly. It goes into review with
            the family’s submissions and is credited the same way.
          </p>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-gray-500 shrink-0">
          Cancel
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pl-student">
            Student
          </label>
          <select id="pl-student" className={inputClass} value={studentId}
                  disabled={students === null}
                  onChange={(e) => setStudentId(e.target.value)}>
            <option value="">
              {students === null ? 'Loading students…' : 'Choose a student'}
            </option>
            {(students || []).map((s) => (
              <option key={s.student_id} value={s.student_id}>
                {s.name}
                {s.enrollment_status && s.enrollment_status !== 'active'
                  ? ` (${s.enrollment_status.replace('_', ' ')})` : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pl-school">
            School it came from
          </label>
          <input id="pl-school" className={inputClass} value={school}
                 placeholder="Riverside High School"
                 onChange={(e) => setSchool(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pl-title">
            Title <span className="text-gray-400">(optional)</span>
          </label>
          <input id="pl-title" className={inputClass} value={title}
                 placeholder={school.trim() ? `Transcript from ${school.trim()}` : 'Transcript'}
                 onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="pl-note">
            Note <span className="text-gray-400">(optional)</span>
          </label>
          <input id="pl-note" className={inputClass} value={note}
                 placeholder="Mailed 8/28, sealed copy on file"
                 onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      <div onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
           onDragLeave={() => setDragging(false)}
           onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer?.files) }}
           className={`rounded-lg border-2 border-dashed p-5 text-center ${
             dragging ? 'border-optio-purple bg-purple-50' : 'border-gray-300'}`}>
        <p className="text-sm text-gray-600">
          Drop the transcript here, or
        </p>
        <button type="button" onClick={() => fileInput.current?.click()}
                className="mt-2 px-3 py-1.5 rounded-lg text-sm font-medium border border-gray-300">
          Choose files
        </button>
        <input ref={fileInput} type="file" multiple className="sr-only" accept={ACCEPT_ATTR}
               aria-label="Choose documents to upload"
               onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        <p className="text-xs text-gray-500 mt-2">PDFs, photos, Word documents or CSV exports</p>
      </div>

      {staged.length > 0 && (
        <ul className="space-y-1">
          {staged.map((file, i) => (
            <li key={`${file.name}-${i}`}
                className="flex items-center justify-between gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
              <span className="truncate text-gray-800">{file.name}</span>
              <span className="flex items-center gap-3 shrink-0">
                <span className="text-xs text-gray-500">{prettySize(file.size)}</span>
                <button type="button" className="text-xs text-gray-500 hover:text-red-600"
                        aria-label={`Remove ${file.name}`}
                        onClick={() => setStaged((c) => c.filter((_, j) => j !== i))}>
                  Remove
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <button type="button" disabled={saving || !studentId || !staged.length} onClick={save}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-50">
        {saving ? 'Uploading…' : 'File for review'}
      </button>
    </div>
  )
}

/**
 * Which inline viewer a file gets. Decided from the stored content_type first
 * and the file name second — a file uploaded from a phone often arrives with a
 * generic octet-stream type, and the extension is then the only honest signal.
 */
export const previewKindFor = (item) => {
  const type = (item.content_type || '').toLowerCase()
  // The stored file name first, then the URL — both really carry an extension.
  // `title` is deliberately not consulted: it's a human label ("Transcript"),
  // and letting it win means a real PDF falls through to the download fallback
  // just because the parent gave it a name without a dot in it.
  const ext = [item.file_name, item.url]
    .map((candidate) => {
      const name = (candidate || '').toLowerCase().split('?')[0].split('#')[0]
      return name.includes('.') ? name.split('.').pop() : ''
    })
    .find(Boolean) || ''
  if (type.startsWith('image/') || item.evidence_type === 'image'
      || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'jfif', 'tiff', 'tif'].includes(ext)) {
    return 'image'
  }
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type.startsWith('text/') || ['csv', 'txt'].includes(ext)) return 'text'
  // doc/docx and anything else: no browser can render it in place, and pretending
  // otherwise gives the reviewer an empty grey box instead of a working link.
  return 'download'
}

const EvidenceList = ({ evidence, busy, onAdd, onDelete }) => {
  const fileInput = useRef(null)
  return (
    <div className="space-y-2">
      {evidence?.length
        ? evidence.map((item) => (
          <EvidenceItem key={item.id} item={item} busy={busy}
                        onDelete={onDelete && (() => onDelete(item.id))} />
        ))
        : <p className="text-sm text-gray-500">No evidence attached.</p>}

      {onAdd && (
        <div>
          <input ref={fileInput} type="file" multiple accept={ACCEPT_ATTR} className="sr-only"
                 aria-label="Add a document to this record"
                 onChange={(e) => {
                   onAdd(e.target.files)
                   // Cleared so the same file can be picked twice — a reviewer
                   // re-adding a document they just deleted otherwise gets a
                   // change event that never fires.
                   e.target.value = ''
                 }} />
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}
                  className="text-xs text-optio-purple font-medium disabled:opacity-50">
            + Add a document
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * One piece of evidence, shown in place.
 *
 * A reviewer deciding whether four years of piano is worth 1.0 fine arts should
 * not be opening tabs to find out — the document is the decision. So each file
 * renders inline: images as images, PDFs in the browser's own viewer (which
 * scrolls through every page inside the frame), CSV and text fetched and shown
 * in a scrolling block. Everything gets a fixed-height, scrollable window rather
 * than a page-length expansion, so a queue of twenty records stays navigable.
 *
 * Previews are lazy — a browser only fetches the ones scrolled into view.
 */
const EvidenceItem = ({ item, busy, onDelete }) => {
  const confirm = useConfirm()
  const [open, setOpen] = useState(true)
  const kind = previewKindFor(item)
  const label = item.title || item.file_name || item.url

  // Deleting a family's document is not undoable and the file goes with it, so
  // it asks first and names what it is about to remove.
  const confirmDelete = async () => {
    if (await confirm(`Delete "${label}"? This removes the file for good.`)) onDelete()
  }

  const DeleteButton = () => (
    onDelete ? (
      <button type="button" disabled={busy} onClick={confirmDelete}
              className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50">
        Delete
      </button>
    ) : null
  )

  // Typed evidence has no file; it IS the text.
  if (!item.url) {
    return (
      <div className="flex items-start justify-between gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
        <p className="min-w-0">
          <span className="text-gray-500 capitalize mr-2">{item.evidence_type}</span>
          <span className="text-gray-700 whitespace-pre-wrap">{item.content}</span>
        </p>
        <div className="shrink-0"><DeleteButton /></div>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-gray-50 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
          {/* The parent's own note about this file — often the only thing that
              says which year a scanned report card belongs to. */}
          {item.content && <p className="text-xs text-gray-500 truncate">{item.content}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={() => setOpen(!open)}
                  className="text-xs text-optio-purple font-medium">
            {open ? 'Collapse' : 'Expand'}
          </button>
          <a href={item.url} target="_blank" rel="noreferrer"
             className="text-xs text-gray-500 hover:text-optio-purple">
            Open
          </a>
          <DeleteButton />
        </div>
      </div>

      {open && (
        <div className="bg-white">
          {kind === 'image' && (
            <div className="max-h-[70vh] overflow-auto">
              <img src={item.url} alt={label} loading="lazy" className="w-full h-auto" />
            </div>
          )}
          {kind === 'pdf' && (
            // The browser's PDF viewer paginates and scrolls inside the frame,
            // which is what makes a 12-page transcript readable without a tab.
            <iframe src={item.url} title={label} loading="lazy"
                    className="w-full h-[70vh] border-0" />
          )}
          {kind === 'text' && <TextPreview url={item.url} />}
          {kind === 'download' && (
            <p className="text-sm text-gray-500 px-3 py-4">
              This file type can’t be shown here.{' '}
              <a href={item.url} target="_blank" rel="noreferrer"
                 className="text-optio-purple hover:underline">Open it</a> to read it.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * CSV and plain text, fetched and shown as-is.
 *
 * Deliberately NOT parsed into a table: an export from another school's system
 * has whatever shape it has, and a half-right table would hide columns a
 * reviewer needs. Monospaced and scrollable shows all of it, honestly.
 */
const TextPreview = ({ url }) => {
  const [state, setState] = useState({ status: 'loading', text: '' })

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => { if (!cancelled) setState({ status: 'ready', text }) })
      .catch(() => { if (!cancelled) setState({ status: 'error', text: '' }) })
    return () => { cancelled = true }
  }, [url])

  if (state.status === 'loading') {
    return <p className="text-sm text-gray-500 px-3 py-4">Loading…</p>
  }
  if (state.status === 'error') {
    return (
      <p className="text-sm text-gray-500 px-3 py-4">
        Couldn’t load this file here.{' '}
        <a href={url} target="_blank" rel="noreferrer"
           className="text-optio-purple hover:underline">Open it</a> instead.
      </p>
    )
  }
  return (
    <pre className="max-h-[70vh] overflow-auto text-xs text-gray-800 p-3 whitespace-pre font-mono">
      {state.text}
    </pre>
  )
}

/** Below this, a reading is shaky enough that the reviewer should look at the
 *  evidence themselves rather than skim the number. Styling only — nothing is
 *  filtered out, because a low-confidence reading is still worth seeing. */
export const LOW_CONFIDENCE = 0.7

/** Course rows, in the order a transcript reads: by subject, then as listed. */
export const transcriptRows = (suggestion) => (suggestion?.subjects || []).flatMap((s) => {
  const courses = s.courses || []
  // A subject the model credited without naming a course still gets a line —
  // it is credit being proposed, and a row missing from the table is credit a
  // reviewer approves without ever seeing it.
  if (!courses.length) {
    return [{
      subject: s.subject, name: '—', credits: s.credits,
      term: null, confidence: s.confidence, rationale: s.rationale,
    }]
  }
  return courses.map((c) => ({
    subject: s.subject, name: c.name, credits: c.credits,
    term: c.term, confidence: s.confidence, rationale: s.rationale,
  }))
})

const TERM_LABELS = { full_year: 'Full year', semester: 'Semester' }

/**
 * The suggestion, drawn as the transcript it is proposing.
 *
 * A registrar's question is "what would this put on the transcript, line by
 * line" — a paragraph of prose makes them reconstruct the table in their head
 * before they can check it, and a number nobody checks is a number nobody
 * caught. So: one row per course, subject and term and credit in columns,
 * confidence attached to the row it belongs to, and the credit/XP total
 * spelled out at the foot the way the transcript will show it.
 *
 * Still labelled a suggestion, and still requiring "Use these numbers" — the
 * table is a preview of a proposal, not a record of a decision.
 */
/**
 * Asks for a password for the files that are actually locked, naming them.
 *
 * Shown only when a run reported `locked_files`, so it appears at the moment it
 * would help and never as standing clutter.
 *
 * Asked once and only once: on success the backend stores the decrypted copy
 * over the locked one, so later runs — and the inline preview, which otherwise
 * prompts the reviewer every single time they open the document — just work.
 * The password itself is never stored anywhere; it is used to open the file and
 * then dropped, and the box is cleared on submit.
 */
const UnlockPrompt = ({ files, busy, onUnlock }) => {
  const [password, setPassword] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!password.trim()) return
    onUnlock(password)
    setPassword('')
  }

  return (
    <form onSubmit={submit} className="px-3 py-2 border-t border-purple-200 bg-amber-50/60">
      <p className="text-sm text-amber-900">
        {files.length === 1 ? 'This file is password-protected and was not read:'
          : 'These files are password-protected and were not read:'}
      </p>
      <ul className="text-xs text-amber-900 list-disc pl-5 mb-2">
        {files.map((name) => <li key={name}>{name}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="sr-only" htmlFor={`pw-${files[0]}`}>PDF password</label>
        <input id={`pw-${files[0]}`} type="password" autoComplete="off"
               placeholder="PDF password" value={password}
               onChange={(e) => setPassword(e.target.value)}
               className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        <button type="submit" disabled={busy || !password.trim()}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-amber-300 text-amber-900 disabled:opacity-50">
          {busy ? 'Reading…' : 'Unlock and re-read'}
        </button>
      </div>
      <p className="text-xs text-amber-800 mt-1">
        Asked once: the unlocked document is kept, so you won’t need this again.
        The password itself isn’t saved.
      </p>
    </form>
  )
}

const AiSuggestion = ({ suggestion, busy, onUnlock, onUse }) => {
  const rows = transcriptRows(suggestion)
  const locked = suggestion.locked_files || []
  const totalCredits = rows.reduce((sum, r) => sum + (Number(r.credits) || 0), 0)
  const flags = suggestion.flags || []

  return (
    <div className="rounded-lg border border-purple-200 bg-purple-50/60 overflow-hidden">
      <div className="flex items-start justify-between gap-3 px-3 py-2 border-b border-purple-200">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-optio-purple uppercase tracking-wide">
            Suggested transcript — not a decision
          </p>
          <p className="text-sm text-gray-700 truncate">
            {[suggestion.school_name,
              [suggestion.started_on, suggestion.ended_on].filter(Boolean).join(' – ')]
              .filter(Boolean).join(' · ') || 'School not identified'}
          </p>
        </div>
        {!!rows.length && (
          <button type="button" onClick={onUse}
                  className="text-xs font-medium text-optio-purple hover:underline shrink-0">
            Use these numbers
          </button>
        )}
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-gray-500 text-left">
                <th scope="col" className="font-medium px-3 py-1.5">Course</th>
                <th scope="col" className="font-medium px-3 py-1.5">Subject</th>
                <th scope="col" className="font-medium px-3 py-1.5">Term</th>
                <th scope="col" className="font-medium px-3 py-1.5 text-right">Credits</th>
                <th scope="col" className="font-medium px-3 py-1.5 text-right">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => {
                const shaky = row.confidence != null && row.confidence < LOW_CONFIDENCE
                return (
                  <tr key={i} className={`border-t border-purple-100 ${shaky ? 'bg-amber-50' : ''}`}>
                    <td className="px-3 py-1.5 text-gray-900">
                      {row.name}
                      {row.rationale && (
                        <span className="block text-xs text-gray-500">{row.rationale}</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-gray-600">{row.subject}</td>
                    <td className="px-3 py-1.5 text-gray-600">{TERM_LABELS[row.term] || '—'}</td>
                    <td className="px-3 py-1.5 text-right text-gray-900 tabular-nums">{row.credits}</td>
                    <td className={`px-3 py-1.5 text-right tabular-nums ${shaky ? 'text-amber-800 font-medium' : 'text-gray-500'}`}>
                      {row.confidence == null ? '—' : `${Math.round(row.confidence * 100)}%`}
                      {shaky && <span className="block text-xs">check this</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-purple-200 font-medium text-gray-900">
                <td className="px-3 py-1.5" colSpan={3}>Total</td>
                <td className="px-3 py-1.5 text-right tabular-nums">
                  {Math.round(totalCredits * 100) / 100}
                </td>
                <td className="px-3 py-1.5 text-right text-gray-500 tabular-nums">
                  {Math.round(totalCredits * 2000)} XP
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      ) : (
        <p className="px-3 py-2 text-sm text-gray-600">
          No credit proposed from this evidence.
        </p>
      )}

      {locked.length > 0 && onUnlock && (
        <UnlockPrompt files={locked} busy={busy} onUnlock={onUnlock} />
      )}

      {(suggestion.summary || flags.length > 0) && (
        <div className="px-3 py-2 border-t border-purple-200 space-y-1">
          {flags.map((flag, i) => (
            <p key={i} className="text-sm text-amber-800">Check: {flag}</p>
          ))}
          {suggestion.summary && (
            <details>
              <summary className="text-xs text-gray-500 cursor-pointer">What the reader saw</summary>
              <p className="text-sm text-gray-600 mt-1">{suggestion.summary}</p>
            </details>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * The transcript step, shown once a record is accepted.
 *
 * Separate from Accept because they are separate decisions: the office accepts
 * when it believes the evidence, and transcribes when the credit is settled.
 * Keeping them apart is also what makes "already added" meaningful — the
 * backend refuses a second conversion, so once this has run the panel shows
 * what it produced instead of a button that would 409.
 *
 * Course names default to the AI's reading and stay editable; they must add up
 * to the subject credit or the backend refuses the save, because the transcript
 * prints both and a transcript that disagrees with itself is worse than one
 * with no line items.
 */
const TranscriptStep = ({ record, suggestion, busy, onSubmit }) => {
  const awarded = record.awarded_credits || {}
  const [school, setSchool] = useState(
    () => suggestion?.school_name || record.provider || ''
  )
  const [courses, setCourses] = useState(() => {
    const bySubject = {}
    for (const s of (suggestion?.subjects || [])) {
      if (!awarded[s.subject] || !(s.courses || []).length) continue
      bySubject[s.subject] = s.courses.map((c) => `${c.name} (${c.credits})`).join(', ')
    }
    return bySubject
  })

  if (record.transfer_credit) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2">
        <p className="text-sm text-green-800">
          On the transcript under <strong>{record.transfer_credit.school_name}</strong>.
        </p>
      </div>
    )
  }

  if (!Object.keys(awarded).length) {
    return (
      <p className="text-sm text-gray-500">
        Accepted without credit — nothing to add to the transcript.
      </p>
    )
  }

  const parsed = parseCourseText(courses)
  const mismatches = Object.keys(awarded).filter((subject) => {
    const list = parsed[subject]
    return list && Math.abs(courseTotal(list) - Number(awarded[subject])) > 0.01
  })

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-3 space-y-3">
      <p className="text-sm font-medium text-amber-900">
        Not on the transcript yet
      </p>
      <p className="text-xs text-amber-900">
        Accepting recorded the award on this record. It does not reach the
        student’s transcript, diploma credits or XP until you add it here.
      </p>
      <p className="text-xs text-gray-600">
        {Object.entries(awarded).map(([s, c]) => `${c} ${s}`).join(' · ')}
        {' — '}
        {Object.values(awarded).reduce((a, b) => a + Number(b), 0) * 2000} XP
      </p>

      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1"
               htmlFor={`school-${record.id}`}>School this credit came from</label>
        <input id={`school-${record.id}`} className={inputClass} value={school}
               onChange={(e) => setSchool(e.target.value)} />
        <p className="text-xs text-gray-500 mt-1">
          Records naming the same school merge into one transcript entry.
        </p>
      </div>

      {Object.keys(awarded).map((subject) => {
        const list = parsed[subject]
        const total = list ? courseTotal(list) : null
        const off = mismatches.includes(subject)
        return (
        <div key={subject}>
          <div className="flex items-baseline justify-between gap-2 mb-1">
            <label className="text-xs font-medium text-gray-600"
                   htmlFor={`courses-${record.id}-${subject}`}>
              {subject} courses — must total {awarded[subject]}
            </label>
            <span className={`text-xs tabular-nums ${off ? 'text-red-700 font-medium' : 'text-gray-500'}`}>
              {total === null ? 'none' : `${total} / ${awarded[subject]}`}
            </span>
          </div>
          <input id={`courses-${record.id}-${subject}`}
                 aria-invalid={off || undefined}
                 className={off ? inputClass.replace('border-gray-300', 'border-red-400') : inputClass}
                 placeholder="US History (1.0), Government (0.5)"
                 value={courses[subject] || ''}
                 onChange={(e) => setCourses({ ...courses, [subject]: e.target.value })} />
          {off && (
            <p className="text-xs text-red-700 mt-1">
              These courses add up to {total}, but {subject} was awarded{' '}
              {awarded[subject]}. Fix a course, or{' '}
              <button type="button"
                      onClick={() => setCourses({ ...courses, [subject]: '' })}
                      className="underline font-medium">
                drop the course names
              </button>{' '}
              and transcribe the credit on its own.
            </p>
          )}
        </div>
      )})}

      <button type="button" disabled={busy || !school.trim() || mismatches.length > 0}
              onClick={() => onSubmit({
                school_name: school.trim(),
                subject_credits: awarded,
                course_names: parsed,
              })}
              className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-50">
        Add to transcript
      </button>
    </div>
  )
}

/**
 * "US History (1.0), Government (0.5)" -> [{name, credits}], per subject.
 *
 * Free text rather than a row editor: a reviewer correcting one course name
 * shouldn't have to work a grid. Anything without a "(credits)" suffix parses
 * to nothing, which shows up as a total that doesn't match — visible before
 * saving rather than as a rejection afterwards.
 */
export const parseCourseText = (bySubject) => {
  const out = {}
  for (const [subject, text] of Object.entries(bySubject || {})) {
    const list = String(text || '').split(',').map((chunk) => {
      const m = chunk.trim().match(/^(.*?)\s*\(([\d.]+)\)$/)
      return m && m[1].trim() ? { name: m[1].trim(), credits: parseFloat(m[2]) } : null
    }).filter(Boolean)
    if (list.length) out[subject] = list
  }
  return out
}

export const courseTotal = (list) => (
  Math.round((list || []).reduce((sum, c) => sum + (Number(c.credits) || 0), 0) * 100) / 100
)

/** A suggestion's subjects as the credit boxes hold them: {subject: "1.0"}. */
export const creditsFromSuggestion = (suggestion) => Object.fromEntries(
  (suggestion?.subjects || [])
    .filter((s) => Number(s.credits) > 0)
    .map((s) => [s.subject, String(s.credits)])
)

const ReviewForm = ({ record, subjects, busy, prefill, onSubmit }) => {
  const [notes, setNotes] = useState(record.review_notes || '')
  const [credits, setCredits] = useState(() => (
    Object.fromEntries(Object.entries(record.awarded_credits || {}).map(([k, v]) => [k, String(v)]))
  ))

  // "Use these numbers" fills the boxes; the reviewer still presses Accept, so
  // the suggestion never becomes an award without a person in between. Keyed on
  // the suggestion object so re-analyzing refills, but typing does not get
  // overwritten on every render.
  useEffect(() => {
    if (prefill) setCredits(creditsFromSuggestion(prefill))
  }, [prefill])

  const awarded = () => Object.fromEntries(
    Object.entries(credits)
      .map(([subject, value]) => [subject, parseFloat(value)])
      .filter(([, value]) => Number.isFinite(value) && value > 0)
  )

  return (
    <div className="pt-3 border-t border-gray-100 space-y-3">
      <div>
        <p className="text-sm font-medium text-gray-700 mb-1.5">Credit to award</p>
        <div className="grid gap-2 sm:grid-cols-3">
          {subjects.map((subject) => (
            <label key={subject.key} className="flex items-center gap-2 text-sm">
              <span className="flex-1 text-gray-600">{subject.name}</span>
              <input type="number" min="0" step="0.25" placeholder="0"
                     aria-label={`${subject.name} credits`}
                     value={credits[subject.key] || ''}
                     onChange={(e) => setCredits({ ...credits, [subject.key]: e.target.value })}
                     className="w-20 rounded-lg border border-gray-300 px-2 py-1 text-sm" />
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor={`notes-${record.id}`}>
          Notes for the family
        </label>
        <textarea id={`notes-${record.id}`} rows={2} className={inputClass} value={notes}
                  onChange={(e) => setNotes(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy}
                onClick={() => onSubmit({ status: 'accepted', review_notes: notes, awarded_credits: awarded() })}
                className="px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-50">
          Accept &amp; award
        </button>
        {record.status === 'submitted' && (
          <button type="button" disabled={busy}
                  onClick={() => onSubmit({ status: 'under_review', review_notes: notes })}
                  className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 disabled:opacity-50">
            Mark in review
          </button>
        )}
        <button type="button" disabled={busy}
                onClick={() => onSubmit({ status: 'rejected', review_notes: notes })}
                className="px-4 py-2 rounded-lg text-sm font-medium border border-red-300 text-red-700 disabled:opacity-50">
          Don’t accept
        </button>
      </div>
    </div>
  )
}

export default PriorLearningPage
