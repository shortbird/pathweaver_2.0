/**
 * The Treehouse student showcase view (/treehouse/showcase).
 *
 * Young-learner friendly: shows the active showcase events (theme, date, countdown)
 * and lets a student join one with a project title. Facilitators create/manage
 * events from the facilitator dashboard; this is the student-facing read + join.
 */
import React, { useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { treehouseAPI } from '../../services/api'

function daysUntil(dateStr) {
  if (!dateStr) return null
  const today = new Date()
  const d = new Date(dateStr + 'T00:00:00')
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24))
}

export default function TreehouseShowcasePage() {
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(null)
  const [formEventId, setFormEventId] = useState(null) // which event's name form is open
  const [titleDraft, setTitleDraft] = useState('')

  const load = () => {
    treehouseAPI.showcaseEvents()
      .then(({ data }) => setEvents(data.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const openForm = (ev) => {
    setFormEventId(ev.id)
    setTitleDraft(ev.my_participation?.project_title || '')
  }

  const submit = async (eventId) => {
    setJoining(eventId)
    try {
      await treehouseAPI.joinShowcase(eventId, { project_title: titleDraft.trim() || null })
      toast.success("You're on the showcase! 🌟")
      setFormEventId(null)
      setTitleDraft('')
      load()
    } catch {
      toast.error('Could not save. Try again!')
    } finally {
      setJoining(null)
    }
  }

  if (loading) return <div className="p-8 text-center text-neutral-400 font-poppins">Loading…</div>

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 font-poppins">
      <h1 className="text-3xl font-bold text-neutral-900">Showcase 🌟</h1>
      <p className="text-neutral-500 mt-1">Share what you made with everyone!</p>

      {events.length === 0 && <p className="text-neutral-400 mt-8">No showcase planned right now — check back soon!</p>}

      <div className="mt-6 space-y-4">
        {events.filter(e => e.status !== 'archived').map((ev) => {
          const days = daysUntil(ev.showcase_date)
          return (
            <div key={ev.id} className="rounded-3xl bg-white border-2 border-amber-200 p-6 shadow-sm">
              <p className="text-2xl font-bold text-neutral-900">{ev.title}</p>
              {ev.theme && <p className="text-neutral-600 mt-1">Theme: {ev.theme}</p>}
              {ev.showcase_date && (
                <p className="text-amber-700 font-semibold mt-2">
                  {days > 0 ? `${days} day${days === 1 ? '' : 's'} to go!` : days === 0 ? 'Today!' : 'Showcase has passed'}
                  <span className="text-neutral-400 font-normal"> · {ev.showcase_date}</span>
                </p>
              )}
              {ev.description && <p className="text-neutral-600 mt-2">{ev.description}</p>}
              {Array.isArray(ev.prompts) && ev.prompts.length > 0 && (
                <div className="mt-3">
                  <p className="text-sm font-semibold text-neutral-700">Project ideas:</p>
                  <ul className="mt-1 space-y-1">
                    {ev.prompts.map((p, i) => (
                      <li key={i} className="text-neutral-600">💡 {p}</li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Inline name form (open when joining or editing) */}
              {formEventId === ev.id ? (
                <div className="mt-4">
                  <input
                    autoFocus
                    value={titleDraft}
                    onChange={(e) => setTitleDraft(e.target.value)}
                    placeholder="What will your project be called?"
                    className="w-full rounded-xl border-2 border-amber-300 px-4 py-3 text-lg"
                  />
                  <div className="flex gap-2 mt-3">
                    <button
                      disabled={joining === ev.id}
                      onClick={() => submit(ev.id)}
                      className="rounded-xl px-5 py-3 text-white font-bold bg-gradient-to-r from-amber-400 to-orange-500 active:scale-95 transition disabled:opacity-50"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => { setFormEventId(null); setTitleDraft('') }}
                      className="rounded-xl px-5 py-3 font-bold text-neutral-500"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : ev.my_participation ? (
                <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-emerald-50 p-4">
                  <div>
                    <p className="font-bold text-emerald-800">✅ You're signed up!</p>
                    {ev.my_participation.project_title && (
                      <p className="text-emerald-700">My project: {ev.my_participation.project_title}</p>
                    )}
                  </div>
                  <button
                    onClick={() => openForm(ev)}
                    className="rounded-xl px-4 py-2 font-bold text-emerald-800 bg-white border border-emerald-200 active:scale-95 transition"
                  >
                    Edit
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => openForm(ev)}
                  className="mt-4 rounded-xl px-5 py-3 text-white font-bold bg-gradient-to-r from-amber-400 to-orange-500 active:scale-95 transition"
                >
                  I want to show my project!
                </button>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
