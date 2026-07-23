import React, { useCallback, useEffect, useRef, useState } from 'react'
import api from '../services/api'
import authService from '../services/authService'
import { useKioskIdleTimeout } from '../hooks/useKioskIdleTimeout'
import KioskSetup from '../components/kiosk/KioskSetup'
import KioskNameGrid from '../components/kiosk/KioskNameGrid'
import KioskStudentSession from '../components/kiosk/KioskStudentSession'

/**
 * Org-generic shared-device kiosk (/kiosk) — the generalization of the
 * Treehouse kiosk (src/programs/treehouse/TreehouseKioskPage.jsx) for any org
 * with feature_flags.kiosk enabled.
 *
 * Flow: an admin provisions a device token in SIS Settings and pastes it here
 * once (kept in localStorage). The device then shows the org-branded student
 * name grid; tapping a name mints a real student session server-side
 * (httpOnly cookies via POST /api/kiosk/login) and enters "student mode",
 * where the student photographs their paper work and attaches it to a quest
 * task through the standard evidence endpoints. Every session ends with a
 * full logout (authService.logout clears cookies + all client auth state) so
 * nothing leaks between students. Standalone route — must be mounted OUTSIDE
 * the authed app Layout, like /treehouse-kiosk.
 */

const TOKEN_KEY = 'kiosk_device_token'
const ROSTER_REFRESH_MS = 3 * 60 * 1000
const IDLE_TIMEOUT_MS = 3 * 60 * 1000

export default function KioskPage() {
  const [token, setToken] = useState(() => {
    try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' }
  })
  const [roster, setRoster] = useState(null) // { org, students }
  const [activeStudent, setActiveStudent] = useState(null) // { id, name }
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const activeStudentRef = useRef(null)
  activeStudentRef.current = activeStudent

  const loadRoster = useCallback(async (t, { silent = false } = {}) => {
    if (!t) return false
    if (!silent) setBusy(true)
    try {
      const { data } = await api.post('/api/kiosk/roster', { token: t })
      setRoster({ org: data.org || {}, students: data.students || [] })
      setError('')
      try { localStorage.setItem(TOKEN_KEY, t) } catch { /* private mode */ }
      setToken(t)
      return true
    } catch (e) {
      if (!silent) {
        setError(
          e?.response?.status === 403
            ? 'The kiosk is not enabled for this school.'
            : 'That device code did not work.'
        )
        setRoster(null)
      }
      // A silent refresh failure (wifi blip) keeps the last good roster.
      return false
    } finally {
      if (!silent) setBusy(false)
    }
  }, [])

  // Initial load with the remembered token.
  useEffect(() => {
    if (token) loadRoster(token)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Auto-refresh the roster every few minutes while on the name grid.
  useEffect(() => {
    if (!token || !roster) return undefined
    const interval = setInterval(() => {
      if (!activeStudentRef.current) loadRoster(token, { silent: true })
    }, ROSTER_REFRESH_MS)
    return () => clearInterval(interval)
  }, [token, roster, loadRoster])

  const signOut = useCallback(async () => {
    try {
      await authService.logout() // clears httpOnly cookies + all client auth state
    } catch { /* local cleanup already ran */ }
    setActiveStudent(null)
  }, [])

  // Shared-device safety: 3 minutes idle in student mode returns to the grid.
  useKioskIdleTimeout({
    enabled: !!activeStudent,
    timeoutMs: IDLE_TIMEOUT_MS,
    onIdle: signOut,
  })

  const pickStudent = async (student) => {
    setBusy(true)
    setError('')
    try {
      const { data } = await api.post('/api/kiosk/login', { token, student_id: student.id })
      setActiveStudent({ id: student.id, name: data?.first_name || student.name })
    } catch {
      setError('Could not log in. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const forgetDevice = async () => {
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* ignore */ }
    setToken('')
    setRoster(null)
    setActiveStudent(null)
    try { await authService.logout() } catch { /* ignore */ }
  }

  if (activeStudent) {
    return (
      <KioskStudentSession
        studentName={activeStudent.name}
        accentColor={roster?.org?.colors?.primary || null}
        onFinished={signOut}
      />
    )
  }

  if (!roster) {
    return <KioskSetup onSubmit={loadRoster} error={error} busy={busy} />
  }

  return (
    <KioskNameGrid
      org={roster.org}
      students={roster.students}
      error={error}
      busy={busy}
      onPick={pickStudent}
      onForget={forgetDevice}
    />
  )
}
