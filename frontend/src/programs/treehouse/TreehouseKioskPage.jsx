/**
 * The Treehouse kiosk (/treehouse-kiosk) — shared-device passwordless student login.
 *
 * Flow: the device is provisioned once with a token (facilitator dashboard → Kiosk).
 * On the device we enter that token once (remembered in localStorage), then show a
 * grid of student photos. Tapping a student mints that student's session server-side
 * (httpOnly cookies) and lands on the Treehouse home.
 *
 * Security: the token gates the roster + login to one org's students; tapping a face
 * logs in AS that student with no portfolio/account-editing affordances surfaced in
 * the young-learner UI. This is an MVP shared-device model — see the report's Phase 3.1
 * notes for hardening (token rotation, device binding, idle timeout).
 */
import React, { useEffect, useState } from 'react'
import { treehouseAPI } from '../../services/api'
import { setFocusMode } from '../../utils/treehouseFocus'

const TOKEN_KEY = 'treehouse_kiosk_token'

export default function TreehouseKioskPage() {
  const [token, setToken] = useState(() => localStorage.getItem(TOKEN_KEY) || '')
  const [entered, setEntered] = useState('')
  const [students, setStudents] = useState(null)
  const [orgLogo, setOrgLogo] = useState(null)
  const [orgName, setOrgName] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const loadRoster = async (t) => {
    setError('')
    try {
      const { data } = await treehouseAPI.kioskRoster(t)
      setStudents(data.students || [])
      setOrgLogo(data.org_logo || null)
      setOrgName(data.org_name || '')
      localStorage.setItem(TOKEN_KEY, t)
      setToken(t)
    } catch (e) {
      setError('That device code did not work.')
      setStudents(null)
    }
  }

  useEffect(() => { if (token) loadRoster(token) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (studentId) => {
    setBusy(true)
    try {
      await treehouseAPI.kioskLogin(token, studentId)
      setFocusMode(true) // kiosk students land in fullscreen (no sidebar/topnav)
      window.location.href = '/treehouse'
    } catch (e) {
      setError('Could not log in. Try again.')
      setBusy(false)
    }
  }

  const forget = () => { localStorage.removeItem(TOKEN_KEY); setToken(''); setStudents(null) }

  // Device not set up yet → ask for the code.
  if (!students) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 font-poppins">
        <div className="bg-white rounded-3xl shadow-lg p-8 w-full max-w-sm">
          <h1 className="text-2xl font-bold text-neutral-900 text-center">🌳 Treehouse Kiosk</h1>
          <p className="text-neutral-500 text-center mt-1">Enter this device's code</p>
          <input
            value={entered}
            onChange={(e) => setEntered(e.target.value.trim())}
            placeholder="thk_…"
            className="w-full mt-4 rounded-xl border border-neutral-200 px-4 py-3 font-mono"
          />
          {error && <p className="text-rose-600 text-sm mt-2">{error}</p>}
          <button
            onClick={() => loadRoster(entered)}
            className="w-full mt-4 rounded-xl py-3 text-white font-semibold bg-gradient-to-r from-optio-purple to-optio-pink"
          >
            Set up device
          </button>
        </div>
      </div>
    )
  }

  // Student picker.
  return (
    <div className="min-h-screen bg-gradient-to-br from-optio-purple/10 to-optio-pink/10 font-poppins p-6">
      <div className="max-w-3xl mx-auto">
        {orgLogo && (
          <img
            src={orgLogo}
            alt={orgName || 'School logo'}
            className="mx-auto mb-4 h-20 w-auto object-contain"
          />
        )}
        <h1 className="text-3xl font-bold text-neutral-900 text-center">Who's learning?</h1>
        {error && <p className="text-rose-600 text-center mt-2">{error}</p>}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 mt-8">
          {students.map((s) => (
            <button
              key={s.id}
              disabled={busy}
              onClick={() => pick(s.id)}
              className="flex flex-col items-center gap-3 bg-white rounded-3xl p-5 shadow-sm hover:shadow-md active:scale-95 transition disabled:opacity-50"
            >
              {s.avatar_url
                ? <img src={s.avatar_url} alt="" className="w-24 h-24 rounded-full object-cover" />
                : <div className="w-24 h-24 rounded-full bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center text-white text-3xl font-bold">
                    {(s.name || '?').charAt(0).toUpperCase()}
                  </div>}
              <span className="text-lg font-bold text-neutral-900">{s.name}</span>
            </button>
          ))}
          {students.length === 0 && <p className="text-neutral-500 col-span-full text-center">No students on this device yet.</p>}
        </div>
        <div className="text-center mt-10">
          <button onClick={forget} className="text-sm text-neutral-400 underline">Forget this device</button>
        </div>
      </div>
    </div>
  )
}
