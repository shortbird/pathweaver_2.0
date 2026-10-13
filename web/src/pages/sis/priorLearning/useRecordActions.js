import { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
// Shared with the family upload page: one list of what a prior-learning upload
// accepts, so the office and a parent are never told different things.
import { isSupported, kindFor } from '../../../utils/priorLearningFiles'

/**
 * What a reviewer can do to one record, shared by the record list and the
 * student workspace so the two views can never treat a record differently.
 *
 * Moved out of PriorLearningPage on 2026-10-13 when the page gained the
 * by-student view; the behaviour is the page's, unchanged.
 *
 *   setRecords   updates the caller's copy of the records in place
 *   reload       refetches the caller's view
 *   onAwarded    runs after an accept that carried credit (the list view
 *                follows the record to the Accepted tab)
 */
const useRecordActions = ({ orgId, setRecords, reload, onAwarded }) => {
  const [busy, setBusy] = useState(false)
  const [analyzing, setAnalyzing] = useState(null)
  const [suggested, setSuggested] = useState({})
  const org = orgId || undefined

  const patch = (recordId, fn) => setRecords((prev) => prev.map((rec) => (
    rec.id === recordId ? fn(rec) : rec
  )))

  const review = async (recordId, payload) => {
    setBusy(true)
    try {
      await api.post(`/api/sis/prior-learning/${recordId}/review`,
        { organization_id: org, ...payload })
      // Accepting moves the record OUT of the tab it was reviewed in, which
      // used to take the unfinished "Add to transcript" step with it — the
      // record simply vanished and nothing said the credit had gone nowhere.
      // Follow it, so the remaining step is on screen instead of one tab away.
      if (payload.status === 'accepted' && Object.keys(payload.awarded_credits || {}).length) {
        toast.success('Credit awarded. Now add it to the transcript.')
        if (onAwarded) onAwarded()
        else reload()
      } else {
        toast.success('Saved')
        reload()
      }
      return true
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save this review')
      return false
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
        { organization_id: org, passwords: passwords || undefined })
      patch(recordId, (rec) => ({ ...rec, ai_suggestion: r.data?.suggestion, ai_status: 'complete' }))
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
        { params: { organization_id: org } })
      patch(recordId, (rec) => ({
        ...rec, evidence: (rec.evidence || []).filter((e) => e.id !== evidenceId),
      }))
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
      patch(recordId, (rec) => ({ ...rec, evidence: [...(rec.evidence || []), ...added] }))
      toast.success(added.length === 1 ? 'Document added' : `${added.length} documents added`)
    }
    if (failed.length) {
      toast.error(`Didn’t upload: ${failed
        .map((f) => (f.reason ? `${f.name} (${f.reason})` : f.name)).join(', ')}`)
    }
    setBusy(false)
  }

  // The only call in the list view that touches a transcript.
  const addToTranscript = async (recordId, payload) => {
    setBusy(true)
    try {
      const r = await api.post(`/api/sis/prior-learning/${recordId}/credit`,
        { organization_id: org, ...payload })
      toast.success(r.data?.action === 'merged'
        ? 'Added to this school’s existing transfer credit'
        : 'Added to the transcript')
      reload()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not add this to the transcript')
    } finally {
      setBusy(false)
    }
  }

  // Accept and transcribe in one step (the student workspace).
  const approve = async (recordId, payload) => {
    setBusy(true)
    try {
      const r = await api.post(`/api/sis/prior-learning/${recordId}/approve`,
        { organization_id: org, ...payload })
      toast.success(r.data?.action === 'merged'
        ? 'Approved and added to this school’s existing transfer credit'
        : 'Approved and added to the transcript')
      reload()
      return true
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not approve this record')
      // An accept that landed without the transcript still changed the record.
      if (err.response?.data?.record) reload()
      return false
    } finally {
      setBusy(false)
    }
  }

  const requestInfo = async (recordId, message) => {
    setBusy(true)
    try {
      await api.post(`/api/sis/prior-learning/${recordId}/request-info`,
        { organization_id: org, message })
      toast.success('Sent back to the family')
      reload()
      return true
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not send this back')
      return false
    } finally {
      setBusy(false)
    }
  }

  const addNote = async (recordId, body) => {
    try {
      await api.post(`/api/sis/prior-learning/${recordId}/notes`, { organization_id: org, body })
      reload()
      return true
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not save that note')
      return false
    }
  }

  return {
    busy, analyzing, suggested, setSuggested,
    review, analyze, deleteEvidence, addDocuments, addToTranscript,
    approve, requestInfo, addNote,
  }
}

export default useRecordActions
