import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../../services/api'
import GlassTabBar from '../../../components/ui/GlassTabBar'
import RecordCard from './RecordCard'
import useRecordActions from './useRecordActions'

export const STATUS_TABS = [
  ['submitted', 'New'],
  ['under_review', 'In review'],
  ['needs_info', 'Sent back'],
  ['accepted', 'Accepted'],
  ['rejected', 'Not accepted'],
]

/**
 * Every record, by status — the "All records" view of the Prior Learning page.
 *
 * This was the whole page until 2026-10-13, when the by-student view became
 * the default. It stays because "everything accepted but not transcribed"
 * across all students is a question a status list answers and a student list
 * does not. Behaviour unchanged; a "Sent back" tab added for needs_info.
 *
 * `filedAt` changes when the office files a record; a new record lands in
 * review, so the list follows it there.
 */
const RecordQueue = ({ orgId, filedAt, onForbidden }) => {
  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState('submitted')
  const [records, setRecords] = useState([])
  const [counts, setCounts] = useState({})
  const [subjects, setSubjects] = useState([])
  const [openId, setOpenId] = useState(null)

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
      })
      .catch((err) => {
        if (err.response?.status === 403) { onForbidden?.(); return }
        toast.error('Could not load prior learning records')
      })
      .finally(() => setLoading(false))
  }, [query, onForbidden])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (!filedAt) return
    if (status === 'under_review') load()
    else setStatus('under_review')
  }, [filedAt])

  const actions = useRecordActions({
    orgId, setRecords, reload: load, onAwarded: () => setStatus('accepted'),
  })
  const review = async (recordId, payload) => {
    if (await actions.review(recordId, payload)) setOpenId(null)
  }

  return (
    <div className="space-y-5">
      <GlassTabBar
        align="start" aria-label="Prior learning queues"
        tabs={STATUS_TABS.map(([id, label]) => ({ id, label, badge: counts[id] || null }))}
        active={status} onSelect={setStatus}
      />

      {loading && <p className="text-sm text-gray-500">Loading…</p>}
      {!loading && !records.length && (
        <p className="text-sm text-gray-500">Nothing here.</p>
      )}

      <div className="space-y-4">
        {records.map((record) => (
          <RecordCard key={record.id} record={record} subjects={subjects}
                      actions={{ ...actions, review }}
                      open={openId === record.id}
                      onToggle={() => setOpenId(openId === record.id ? null : record.id)} />
        ))}
      </div>
    </div>
  )
}

export default RecordQueue
