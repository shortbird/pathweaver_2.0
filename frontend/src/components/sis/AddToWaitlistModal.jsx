import React, { useEffect, useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'
import { ModalOverlay } from '../ui'
import Button from '../ui/Button'
import SearchSelect from '../ui/SearchSelect'
import { withOrg } from '../../pages/sis/useSisOrg'

/**
 * Hand-add a student to the enrollment waitlist (SIS admin only).
 *
 * For families who got in line somewhere other than the registration funnel —
 * the old Google form, a phone call. "Got in line on" is the important field:
 * it records when they ACTUALLY signed up, so a family added today with their
 * real form date slots into their rightful place in the queue instead of the
 * back of it. Leave it on today for someone who just called.
 */
const AddToWaitlistModal = ({ orgId, bands = [], existingStudentIds = [], onClose, onAdded }) => {
  const [students, setStudents] = useState([])
  const [loading, setLoading] = useState(true)
  const [studentId, setStudentId] = useState('')
  const [queuedOn, setQueuedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [bandKey, setBandKey] = useState('auto')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!orgId) { setLoading(false); return }
    api.get(withOrg('/api/sis/members', orgId))
      .then((r) => setStudents((r.data?.members || []).filter((m) => m.is_student)))
      .catch(() => toast.error('Could not load students'))
      .finally(() => setLoading(false))
  }, [orgId])

  // Someone already waiting can't be added twice.
  const options = useMemo(() => {
    const taken = new Set(existingStudentIds)
    return students.filter((s) => !taken.has(s.id))
  }, [students, existingStudentIds])

  const submit = async () => {
    if (!studentId) { toast.error('Pick a student'); return }
    const band = bands.find((b) => b.band_label === bandKey)
    setSaving(true)
    try {
      const { data } = await api.post('/api/sis/enrollment-waitlist/manual', {
        organization_id: orgId,
        student_user_id: studentId,
        // Midday UTC keeps the date from sliding a day in either direction when
        // it's read back in the school's timezone.
        queued_at: queuedOn ? `${queuedOn}T12:00:00Z` : null,
        band_min_age: band ? band.band_min_age : null,
        band_max_age: band ? band.band_max_age : null,
      })
      toast.success(`${data.student_name} added to the waitlist${data.position ? ` at #${data.position}` : ''}`)
      onAdded()
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not add that student')
    } finally { setSaving(false) }
  }

  const field = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-4">
          <h2 className="text-lg font-semibold text-gray-900">Add a student to the waitlist</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
        </div>

        <div className="p-4 space-y-4">
          <p className="text-sm text-neutral-500">
            For families who queued outside the registration funnel — the Google form, a phone call.
            Set the date they actually got in line and they'll slot into the right place.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Student</label>
            {loading ? (
              <p className="text-sm text-neutral-400">Loading students…</p>
            ) : (
              <SearchSelect
                value={studentId}
                onChange={setStudentId}
                options={options}
                getId={(s) => s.id}
                getLabel={(s) => s.name || s.email}
                placeholder="Search students…"
              />
            )}
          </div>

          <div>
            <label htmlFor="wl-queued-on" className="block text-sm font-medium text-gray-700 mb-1">
              Got in line on
            </label>
            <input id="wl-queued-on" type="date" className={field}
              value={queuedOn} max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setQueuedOn(e.target.value)} />
            <p className="text-xs text-neutral-400 mt-1">
              Their original sign-up date — this decides where they land in the queue.
            </p>
          </div>

          {bands.length > 1 && (
            <div>
              <label htmlFor="wl-band" className="block text-sm font-medium text-gray-700 mb-1">
                Age group
              </label>
              <select id="wl-band" className={field} value={bandKey}
                onChange={(e) => setBandKey(e.target.value)}>
                <option value="auto">Match their age automatically</option>
                {bands.map((b) => (
                  <option key={b.band_label} value={b.band_label}>{b.band_label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200">
          <button onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition-colors text-sm">
            Cancel
          </button>
          <Button size="sm" onClick={submit} disabled={saving || !studentId}>
            {saving ? 'Adding…' : 'Add to waitlist'}
          </Button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default AddToWaitlistModal
