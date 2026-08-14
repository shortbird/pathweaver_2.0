import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'react-hot-toast'
import { ArrowUpTrayIcon, DocumentIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from '../services/api'
import BackToSchool from '../components/navigation/BackToSchool'

/**
 * Prior learning (Learning app) — the family's side.
 *
 * A parent with a shoebox of paperwork from their child's last school should be
 * able to empty it into this page in one go. So the page is DOCUMENT-FIRST: pick
 * the child, drop in every file at once, optionally say in a line what each one
 * is, send. There is no record to create first and no form to fill in before the
 * upload button appears — the earlier version asked for a title, a provider, a
 * subject, two dates and an hours estimate before a parent could attach anything.
 *
 * Underneath, one send is still one record (the unit the school reviews and
 * awards credit against) with one piece of evidence per file. The per-file note
 * rides along in the evidence row, which is what a reviewer reads next to the
 * scan, and what the future analyzer gets told about a file it can't otherwise
 * date.
 *
 * Files go through the same MediaUploadService as task evidence, into the same
 * bucket, so everything here renders in the portfolio like the student's own work.
 *
 * Backed by /api/sis/parent/prior-learning (authorized by family relationship).
 */

const STATUS_STYLES = {
  draft: 'bg-amber-100 text-amber-800',
  submitted: 'bg-blue-100 text-blue-700',
  under_review: 'bg-amber-100 text-amber-800',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
}

const STATUS_LABELS = {
  draft: 'Not sent yet',
  submitted: 'Sent',
  under_review: 'Being reviewed',
  accepted: 'Credit awarded',
  rejected: 'Not accepted',
}

const SUBJECT_NAMES = {
  language_arts: 'Language Arts', math: 'Math', science: 'Science',
  social_studies: 'Social Studies', financial_literacy: 'Financial Literacy',
  health: 'Health', pe: 'PE', fine_arts: 'Fine Arts', cte: 'CTE',
  digital_literacy: 'Digital Literacy', electives: 'Electives',
}

const MAX_FILES = 25

// Mirrors backend/config/constants.py ALLOWED_IMAGE_EXTENSIONS +
// ALLOWED_DOCUMENT_EXTENSIONS. The backend is the real gate; this exists so a
// parent who drops in a spreadsheet finds out immediately, instead of after
// waiting through an eleven-file upload (2026-08-14: two CSV exports were
// refused with a message that didn't say why).
const ACCEPTED_EXTENSIONS = [
  'pdf', 'doc', 'docx', 'txt', 'csv',
  'jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'tiff', 'tif', 'bmp', 'avif', 'jfif',
]

const extensionOf = (name) => (name.includes('.') ? name.split('.').pop().toLowerCase() : '')

const isSupported = (file) => ACCEPTED_EXTENSIONS.includes(extensionOf(file.name))

const inputClass = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

// An image gets 'image' evidence so the portfolio can show it inline; everything
// else is a 'document'. Same two kinds a student picks by hand on a task.
const kindFor = (file) => (file.type?.startsWith('image/') ? 'image' : 'document')

const prettySize = (bytes) => (
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`
)

const creditSummary = (awarded) => Object.entries(awarded || {})
  .map(([subject, credits]) => `${credits} ${SUBJECT_NAMES[subject] || subject}`)
  .join(' · ')

const StatusPill = ({ status }) => (
  <span className={`text-xs px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[status] || STATUS_STYLES.submitted}`}>
    {STATUS_LABELS[status] || status}
  </span>
)

const FamilyPriorLearningPage = () => {
  const [loading, setLoading] = useState(true)
  const [orgs, setOrgs] = useState([])
  const [orgId, setOrgId] = useState('')
  const [records, setRecords] = useState([])
  const [students, setStudents] = useState([])
  const [studentId, setStudentId] = useState('')
  // Files staged in the browser, each {file, note}. Nothing is uploaded until
  // Send — so a parent can drop in eight things, retitle two and drop one.
  const [staged, setStaged] = useState([])
  const [summary, setSummary] = useState('')
  const [dragging, setDragging] = useState(false)
  const [sending, setSending] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    api.get('/api/sis/parent/context')
      .then((r) => {
        const list = r.data?.orgs || []
        setOrgs(list)
        if (list.length) setOrgId(list[0].organization_id)
      })
      .catch(() => toast.error('Could not load your family'))
      .finally(() => setLoading(false))
  }, [])

  const load = useCallback(() => {
    if (!orgId) { setRecords([]); setStudents([]); return }
    api.get(`/api/sis/parent/prior-learning?organization_id=${orgId}`)
      .then((r) => {
        setRecords(r.data?.records || [])
        const kids = r.data?.students || []
        setStudents(kids)
        setStudentId((current) => (
          kids.some((s) => s.student_id === current) ? current
            : (kids.length === 1 ? kids[0].student_id : '')
        ))
      })
      .catch(() => toast.error('Could not load your uploads'))
  }, [orgId])

  useEffect(() => { load() }, [load])

  const org = useMemo(() => orgs.find((o) => o.organization_id === orgId), [orgs, orgId])
  const schoolName = org?.organization_name || 'the school'

  const addFiles = (fileList) => {
    const all = Array.from(fileList || [])
    if (!all.length) return
    // Refused types are turned away at the door, named, and never staged — so
    // "Send 3 documents" always means three documents will actually go.
    const incoming = all.filter(isSupported)
    const refused = all.filter((f) => !isSupported(f))
    if (refused.length) {
      toast.error(
        `Can’t use ${refused.map((f) => f.name).join(', ')} — try a PDF, a photo, or a CSV.`)
    }
    if (!incoming.length) return
    setStaged((current) => {
      const room = MAX_FILES - current.length
      if (room <= 0) {
        toast.error(`You can send ${MAX_FILES} documents at a time`)
        return current
      }
      if (incoming.length > room) {
        toast.error(`Only the first ${room} were added — ${MAX_FILES} at a time`)
      }
      return [...current, ...incoming.slice(0, room).map((file) => ({ file, note: '' }))]
    })
  }

  const setNote = (index, note) => setStaged((current) => (
    current.map((item, i) => (i === index ? { ...item, note } : item))
  ))

  const removeStaged = (index) => setStaged((current) => current.filter((_, i) => i !== index))

  const onDrop = (e) => {
    e.preventDefault()
    setDragging(false)
    addFiles(e.dataTransfer?.files)
  }

  const send = async () => {
    if (!studentId) { toast.error('Choose which child these are for'); return }
    if (!staged.length) { toast.error('Add at least one document'); return }
    setSending(true)
    try {
      // One send is one record: the unit the school reviews and awards against.
      // Its title is the parent's summary if they wrote one, else the first
      // file's name — never an empty row in the office's queue.
      const created = await api.post('/api/sis/parent/prior-learning', {
        organization_id: orgId,
        student_user_id: studentId,
        title: summary.trim() || staged[0].file.name,
        description: summary.trim() || undefined,
      })
      const recordId = created.data?.record?.id
      if (!recordId) throw new Error('no record')

      const failed = []
      for (const { file, note } of staged) {
        const data = new FormData()
        data.append('evidence_type', kindFor(file))
        data.append('file', file)
        data.append('note', note.trim())
        data.append('organization_id', orgId)
        try {
          await api.post(
            `/api/sis/parent/prior-learning/${recordId}/evidence?organization_id=${orgId}`, data)
        } catch (err) {
          // Carry the server's reason, not just the name: "did not upload" with
          // no why is what made the first refused CSV impossible to act on.
          failed.push({ name: file.name, reason: err.response?.data?.error })
        }
      }

      if (failed.length === staged.length) {
        // Nothing landed, so there is nothing to send. The record stays a draft
        // and shows below, rather than the parent being told "sent" falsely.
        toast.error(failed[0].reason
          ? `Nothing could be uploaded — ${failed[0].reason}`
          : 'None of your documents could be uploaded. Please try again.')
        load()
        return
      }

      await api.post(`/api/sis/parent/prior-learning/${recordId}/submit`,
        { organization_id: orgId })

      if (failed.length) {
        toast.error(`Sent, but these did not upload: ${
          failed.map((f) => (f.reason ? `${f.name} (${f.reason})` : f.name)).join(', ')}`)
      } else {
        toast.success(`Sent ${staged.length === 1 ? 'your document' : `${staged.length} documents`} to ${schoolName}`)
      }
      setStaged([])
      setSummary('')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send your documents')
    } finally {
      setSending(false)
    }
  }

  const withdraw = async (recordId) => {
    try {
      await api.delete(`/api/sis/parent/prior-learning/${recordId}?organization_id=${orgId}`)
      toast.success('Removed')
      load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not remove that')
    }
  }

  if (loading) {
    return <div className="max-w-3xl mx-auto px-4 py-10 text-gray-500">Loading…</div>
  }

  if (!orgs.length) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-10">
        <p className="text-gray-600">Prior learning uploads aren’t available for your account.</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
      <div>
        <BackToSchool />
        <h1 className="text-2xl font-bold text-gray-900 font-poppins mt-3">Prior Learning</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Upload records of learning your child did before joining, or outside of, Optio —
          transcripts, report cards, certificates, course descriptions, samples of their work.
          Send as many as you like at once. {schoolName} reviews them and can award
          high-school credit toward their transcript.
        </p>
      </div>

      {orgs.length > 1 && (
        <select className={inputClass} value={orgId} onChange={(e) => setOrgId(e.target.value)}
                aria-label="School">
          {orgs.map((o) => (
            <option key={o.organization_id} value={o.organization_id}>{o.organization_name}</option>
          ))}
        </select>
      )}

      <section className="space-y-4">
        {/* Asked first, and only when there's a choice to make — a parent with
            one child should never be made to answer a question with one answer. */}
        {students.length > 1 && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="pl-student">
              Who are these for?
            </label>
            <select id="pl-student" className={inputClass} value={studentId}
                    onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Choose a child…</option>
              {students.map((s) => (
                <option key={s.student_id} value={s.student_id}>{s.name}</option>
              ))}
            </select>
          </div>
        )}

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
            dragging ? 'border-optio-purple bg-purple-50' : 'border-gray-300 bg-white'}`}
        >
          <ArrowUpTrayIcon aria-hidden="true" className="w-8 h-8 mx-auto text-optio-purple" />
          <p className="mt-3 text-sm font-medium text-gray-900">
            Drag your documents here
          </p>
          <p className="text-xs text-gray-500 mt-1">
            PDFs, photos, Word documents or CSV exports — as many as you have
          </p>
          <button type="button" onClick={() => fileInput.current?.click()}
                  className="mt-4 px-4 py-2 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink">
            Choose files
          </button>
          <input ref={fileInput} type="file" multiple className="sr-only"
                 accept={ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',')}
                 aria-label="Choose documents to upload"
                 onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
        </div>

        {staged.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-medium text-gray-700">
              {staged.length} {staged.length === 1 ? 'document' : 'documents'} ready to send
            </p>
            {staged.map(({ file, note }, index) => (
              <div key={`${file.name}-${index}`}
                   className="bg-white border border-gray-200 rounded-xl p-3 flex gap-3">
                <DocumentIcon aria-hidden="true" className="w-5 h-5 text-gray-400 shrink-0 mt-2" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-500">{prettySize(file.size)}</p>
                  {/* Optional by design and labelled as such: a parent sending
                      twelve documents should not feel they owe twelve captions. */}
                  <input
                    className="mt-2 w-full rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
                    value={note}
                    aria-label={`What is ${file.name}? (optional)`}
                    placeholder="What is this? (optional)"
                    onChange={(e) => setNote(index, e.target.value)}
                  />
                </div>
                <button type="button" onClick={() => removeStaged(index)}
                        aria-label={`Remove ${file.name}`}
                        className="text-gray-400 hover:text-red-600 shrink-0 self-start">
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>
            ))}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 mt-4" htmlFor="pl-summary">
                Anything else {schoolName} should know? (optional)
              </label>
              <textarea id="pl-summary" rows={2} className={inputClass} value={summary}
                        placeholder="e.g. Two years at Riverside Co-op — algebra and biology."
                        onChange={(e) => setSummary(e.target.value)} />
            </div>

            <button type="button" onClick={send} disabled={sending}
                    className="mt-2 px-5 py-2.5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-optio-purple to-optio-pink disabled:opacity-50">
              {sending
                ? 'Sending…'
                : `Send ${staged.length} ${staged.length === 1 ? 'document' : 'documents'}`}
            </button>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-semibold text-gray-900">What you’ve sent</h2>
        {!records.length && <p className="text-sm text-gray-500">Nothing yet.</p>}

        {records.map((record) => {
          const studentName = students.find((s) => s.student_id === record.student_user_id)?.name
          const files = record.evidence || []
          return (
            <div key={record.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-gray-900 truncate">{record.title}</h3>
                    <StatusPill status={record.status} />
                  </div>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {[studentName, `${files.length} ${files.length === 1 ? 'document' : 'documents'}`]
                      .filter(Boolean).join(' · ')}
                  </p>
                </div>
                {(record.status === 'draft' || record.status === 'submitted') && (
                  <button type="button" onClick={() => withdraw(record.id)}
                          className="text-sm text-red-600 shrink-0">Remove</button>
                )}
              </div>

              {files.map((item) => (
                <div key={item.id} className="text-sm bg-gray-50 rounded-lg px-3 py-2">
                  {item.url ? (
                    <a href={item.url} target="_blank" rel="noreferrer"
                       className="text-optio-purple hover:underline break-all">
                      {item.title || item.file_name || item.url}
                    </a>
                  ) : (
                    <span className="text-gray-700">{item.content}</span>
                  )}
                  {item.url && item.content && (
                    <p className="text-xs text-gray-500 mt-0.5">{item.content}</p>
                  )}
                </div>
              ))}

              {record.status === 'accepted' && (
                <p className="text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
                  {Object.keys(record.awarded_credits || {}).length
                    ? `Credit awarded: ${creditSummary(record.awarded_credits)}`
                    : 'Accepted for the portfolio (no credit awarded).'}
                </p>
              )}
              {record.review_notes && (
                <p className="text-sm text-gray-600 bg-gray-50 rounded-lg px-3 py-2">
                  <span className="font-medium">From {schoolName}: </span>{record.review_notes}
                </p>
              )}
            </div>
          )
        })}
      </section>
    </div>
  )
}

export default FamilyPriorLearningPage
