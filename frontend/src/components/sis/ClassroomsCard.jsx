import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

/**
 * Classrooms & Rooms — the school's facility rooms and activity spaces.
 * Stored in feature_flags.sis_settings.rooms as [{name, description}].
 * The class editor offers them as a dropdown picker when assigning class locations.
 */
const ClassroomsCard = ({ orgId, org, onUpdate }) => {
  const settings = org.feature_flags?.sis_settings || {}
  const rawRooms = settings.rooms || []
  // Coerce existing string items or objects to {name, description}
  const initialRooms = rawRooms.map((r) =>
    typeof r === 'string' ? { name: r, description: '' } : { name: r.name || '', description: r.description || '' }
  )

  const [rooms, setRooms] = useState(initialRooms)
  const [saving, setSaving] = useState(false)

  const setRoom = (i, patch) => setRooms((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)))

  const save = async () => {
    const cleaned = rooms
      .map((r) => ({ name: (r.name || '').trim(), description: (r.description || '').trim() }))
      .filter((r) => r.name)

    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...settings, rooms: cleaned.length ? cleaned : null },
        },
      })
      setRooms(cleaned)
      toast.success('Rooms saved')
      onUpdate && onUpdate()
    } catch (e) {
      toast.error(e.response?.data?.error || 'Failed to save rooms')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-lg font-semibold text-neutral-900">Classrooms &amp; Rooms</h2>
        <button
          onClick={() => setRooms((rs) => [...rs, { name: '', description: '' }])}
          className="text-sm font-medium text-optio-purple hover:underline"
        >
          + Add room
        </button>
      </div>
      <p className="text-sm text-neutral-500 mb-4">
        Enter the classrooms, labs, and spaces in your school. When editing a class, staff can select a room from a dropdown instead of typing it manually.
      </p>

      {rooms.length === 0 && <p className="text-sm text-neutral-400 mb-3">No rooms added yet.</p>}

      <div className="space-y-3 mb-4">
        {rooms.map((r, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <input
              className={`${field} w-48 font-medium`}
              placeholder="Room name (e.g. Room 101)"
              value={r.name}
              onChange={(e) => setRoom(i, { name: e.target.value })}
              aria-label="Room name"
            />
            <input
              className={`${field} flex-1 min-w-[200px]`}
              placeholder="Description (e.g. Science Lab with 12 benches)"
              value={r.description}
              onChange={(e) => setRoom(i, { description: e.target.value })}
              aria-label="Room description"
            />
            <button
              onClick={() => setRooms((rs) => rs.filter((_, j) => j !== i))}
              className="text-red-500 text-sm px-2 hover:underline"
              aria-label="Remove room"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={save}
        disabled={saving}
        className="px-5 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white font-medium hover:opacity-90 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save rooms'}
      </button>
    </div>
  )
}

export default ClassroomsCard
