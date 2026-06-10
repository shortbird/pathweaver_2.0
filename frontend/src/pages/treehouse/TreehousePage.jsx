/**
 * The Treehouse landing (/treehouse).
 *
 * Branches by role:
 *  - Facilitator (org_admin / advisor): a welcome card linking to the facilitator
 *    dashboard (signals, pins, showcase, kiosk).
 *  - Student: a young-learner home — four big touch buttons, the most-recently
 *    started task surfaced at the top, and the "I Need Help" / "I'm Proud" signals.
 *
 * All data + writes are gated server-side by org slug 'treehouse' (backend/routes/treehouse.py).
 */
import React, { useEffect, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { useAuth } from '../../contexts/AuthContext'
import { treehouseAPI } from '../../services/api'
import { isFocusMode, setFocusMode } from '../../utils/treehouseFocus'

const isFacilitatorRole = (role, user) => {
  const roles = new Set([role, user?.org_role, ...(user?.org_roles || [])])
  return roles.has('org_admin') || roles.has('advisor') || roles.has('superadmin') || user?.role === 'superadmin'
}

function BigButton({ to, onClick, color, icon, label }) {
  const cls = `flex flex-col items-center justify-center gap-3 rounded-3xl p-8 text-white shadow-md transition active:scale-95 ${color}`
  const inner = (
    <>
      <span className="text-5xl" aria-hidden>{icon}</span>
      <span className="text-xl font-bold text-center leading-tight">{label}</span>
    </>
  )
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  return <button type="button" onClick={onClick} className={cls}>{inner}</button>
}

function FacilitatorWelcome() {
  return (
    <div className="max-w-2xl mx-auto px-4 py-10 font-poppins">
      <h1 className="text-3xl font-bold text-neutral-900">The Treehouse</h1>
      <p className="text-neutral-500 mt-2">Your facilitator space — see who needs help, who's proud, prepare pins, and plan showcases.</p>
      <Link
        to="/treehouse/facilitator"
        className="inline-block mt-6 rounded-xl px-6 py-3 text-white font-semibold bg-gradient-to-r from-optio-purple to-optio-pink shadow-md"
      >
        Open Facilitator Dashboard
      </Link>
    </div>
  )
}

function StudentHome() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const [home, setHome] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [helpWaiting, setHelpWaiting] = useState(false)

  // "I'm done" — clear this student's session and return the shared device to the
  // kiosk picker so the next student can sign in. Always lands on the kiosk; the
  // kiosk page shows its picker (device token is remembered) or prompts for the
  // device code if this device hasn't been set up.
  const finishSession = async () => {
    try { await logout() } catch { /* logout self-handles errors */ }
    window.location.replace('/treehouse-kiosk')
  }

  const load = useCallback(async () => {
    try {
      const { data } = await treehouseAPI.home()
      setHome(data)
    } catch (e) {
      // Non-fatal; the buttons still work.
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const sendSignal = async (type) => {
    setSending(true)
    try {
      await treehouseAPI.createSignal({
        signal_type: type,
        quest_id: home?.recent?.quest?.id || null,
        task_id: home?.recent?.next_task?.id || null,
      })
      if (type === 'help') {
        setHelpWaiting(true) // show encouraging things to do while waiting
      } else {
        toast.success('Yay! We told your facilitator!')
      }
    } catch (e) {
      toast.error('Could not send. Try again!')
    } finally {
      setSending(false)
    }
  }

  const recent = home?.recent
  return (
    <div className="max-w-3xl mx-auto px-4 py-8 font-poppins">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-neutral-900">
          Hi{home?.student_name ? `, ${home.student_name}` : ''}!
        </h1>
        {typeof home?.spendable_xp === 'number' && (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-800 font-bold px-4 py-2 text-lg">
            🪙 {home.spendable_xp}
          </span>
        )}
      </div>

      {/* Most recently started task */}
      {recent?.next_task && (
        <button
          onClick={() => navigate(`/quests/${recent.quest.id}`)}
          className="mt-6 w-full text-left rounded-3xl bg-white border-2 border-optio-purple/30 p-6 shadow-sm active:scale-[0.99] transition"
        >
          <p className="text-sm font-semibold text-optio-purple uppercase tracking-wide">Keep going</p>
          <p className="text-2xl font-bold text-neutral-900 mt-1">{recent.next_task.title}</p>
          <p className="text-neutral-500 mt-1">{recent.quest.title}</p>
        </button>
      )}

      {/* Four big buttons */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <BigButton to="/quests" color="bg-gradient-to-br from-optio-purple to-indigo-500" icon="📚" label="My Quests" />
        <BigButton to="/treehouse/browse" color="bg-gradient-to-br from-optio-pink to-rose-500" icon="🔭" label="Find a Quest" />
        <BigButton to="/treehouse/showcase" color="bg-gradient-to-br from-amber-400 to-orange-500" icon="🌟" label="Showcase" />
        <BigButton to="/bounties" color="bg-gradient-to-br from-emerald-400 to-teal-500" icon="🛠️" label="School Jobs" />
      </div>

      {/* Help + Proud */}
      <div className="grid grid-cols-2 gap-4 mt-4">
        <button
          disabled={sending}
          onClick={() => sendSignal('help')}
          className="rounded-2xl bg-sky-100 text-sky-800 font-bold py-5 text-lg active:scale-95 transition disabled:opacity-50"
        >
          🙋 I Need Help
        </button>
        <button
          disabled={sending}
          onClick={() => sendSignal('proud')}
          className="rounded-2xl bg-yellow-100 text-yellow-800 font-bold py-5 text-lg active:scale-95 transition disabled:opacity-50"
        >
          🎉 I'm Proud of This!
        </button>
      </div>

      {!loading && !recent?.next_task && (
        <p className="text-center text-neutral-400 mt-8">Tap "Find a Quest" to start something new!</p>
      )}

      {/* Hand the device to the next student + fullscreen toggle */}
      <div className="text-center mt-10 space-y-3">
        {!isFocusMode() && (
          <div>
            <button
              onClick={() => setFocusMode(true)}
              className="inline-flex items-center gap-2 rounded-full px-6 py-3 bg-optio-purple/10 text-optio-purple font-semibold active:scale-95 transition"
            >
              ⛶ Go fullscreen
            </button>
          </div>
        )}
        <button
          onClick={finishSession}
          className="inline-flex items-center gap-2 rounded-full px-6 py-3 bg-neutral-100 text-neutral-700 font-semibold active:scale-95 transition"
        >
          👋 I'm done — let someone else use this
        </button>
      </div>

      {/* Productive-waiting panel — encourage momentum while help is on the way */}
      {helpWaiting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setHelpWaiting(false)}>
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <p className="text-2xl font-bold text-neutral-900">A grown-up is on the way! 🙋</p>
            <p className="text-neutral-500 mt-1">While you wait, you could…</p>
            <div className="grid gap-3 mt-5">
              <button onClick={() => navigate('/quests')} className="rounded-2xl bg-optio-purple/10 text-optio-purple font-bold py-4">📚 Work on another task</button>
              <button onClick={() => navigate('/treehouse/browse')} className="rounded-2xl bg-optio-pink/10 text-optio-pink font-bold py-4">🔭 Find a new quest</button>
              <button onClick={() => navigate('/bounties')} className="rounded-2xl bg-emerald-50 text-emerald-700 font-bold py-4">🛠️ Do a School Job</button>
              <button onClick={() => navigate('/treehouse/showcase')} className="rounded-2xl bg-amber-50 text-amber-700 font-bold py-4">🌟 Work on my showcase</button>
            </div>
            <p className="text-neutral-400 text-sm mt-4">You can also ask a friend for help!</p>
            <button onClick={() => setHelpWaiting(false)} className="mt-4 text-neutral-500 font-semibold">Keep waiting here</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TreehousePage() {
  const { user, effectiveRole } = useAuth()
  if (isFacilitatorRole(effectiveRole, user)) return <FacilitatorWelcome />
  return <StudentHome />
}
