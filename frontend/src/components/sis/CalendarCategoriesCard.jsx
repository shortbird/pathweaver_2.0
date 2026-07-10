import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import api from '../../services/api'

const field = 'rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple'

// Preview swatches mirror CATEGORY_COLORS on the Calendar page (by index).
const SWATCHES = ['bg-blue-400', 'bg-green-400', 'bg-amber-400',
  'bg-rose-400', 'bg-teal-400', 'bg-indigo-400']

/**
 * Calendar categories — the org's own event groupings (e.g. Camps, School
 * Dates, Events). Stored in feature_flags.sis_settings.calendar_categories as
 * an array of labels; the Calendar page colors events and offers filters (and
 * per-category subscribe feeds) from this list.
 */
const CalendarCategoriesCard = ({ orgId, org, onUpdate }) => {
  const settings = org.feature_flags?.sis_settings || {}
  const [categories, setCategories] = useState(settings.calendar_categories || [])
  const [saving, setSaving] = useState(false)

  const setCategory = (i, value) => setCategories((cs) => cs.map((c, j) => (j === i ? value : c)))

  const save = async () => {
    const cleaned = [...new Set(categories.map((c) => c.trim()).filter(Boolean))]
    setSaving(true)
    try {
      await api.put(`/api/admin/organizations/${orgId}`, {
        feature_flags: {
          ...(org.feature_flags || {}),
          sis_settings: { ...settings, calendar_categories: cleaned.length ? cleaned : null },
        },
      })
      setCategories(cleaned)
      toast.success('Calendar categories saved')
      onUpdate && onUpdate()
    } catch {
      toast.error('Could not save the categories')
    } finally { setSaving(false) }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-neutral-900">Calendar categories</h2>
      <p className="text-xs text-neutral-500 mt-0.5 mb-3">
        Group calendar events (e.g. Camps, School Dates, Events). Each category gets its own
        color, filter, and subscribe link on the Calendar page.
      </p>
      <div className="space-y-2">
        {categories.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`w-3 h-3 rounded-full flex-shrink-0 ${SWATCHES[i % SWATCHES.length]}`} />
            <input
              className={`${field} flex-1`}
              value={c}
              onChange={(e) => setCategory(i, e.target.value)}
              placeholder="Category name"
            />
            <button onClick={() => setCategories((cs) => cs.filter((_, j) => j !== i))}
              className="text-neutral-400 hover:text-red-500 text-lg leading-none px-1" aria-label="Remove category">×</button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-3 mt-3">
        <button onClick={() => setCategories((cs) => [...cs, ''])}
          className="text-sm font-medium text-optio-purple hover:underline">+ Add category</button>
        <button onClick={save} disabled={saving}
          className="ml-auto px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold hover:opacity-90 disabled:opacity-50">
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  )
}

export default CalendarCategoriesCard
