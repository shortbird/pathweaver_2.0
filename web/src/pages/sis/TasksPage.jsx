import React, { useCallback, useEffect, useState } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeHr, isSisAdmin } from './sisRole'
import { getPreviewTeacher } from './teacherPreview'
import BackToDashboard from '../../components/sis/BackToDashboard'
import MyTaskInbox from '../../components/sis/tasks/MyTaskInbox'
import AssignComposer from '../../components/sis/tasks/AssignComposer'
import AssignedWork from '../../components/sis/tasks/AssignedWork'
import { TaskTemplatesManager } from '../../components/sis/tasks/TaskTemplatesManager'
import GlassTabBar from '../../components/ui/GlassTabBar'
import ReportIncidentButton from '../../components/sis/incidents/ReportIncidentButton'
import MyIncidentReports from '../../components/sis/incidents/MyIncidentReports'

/**
 * Tasks -- one page, organized by direction, because that is how everyone
 * thinks about work:
 *
 *   My tasks    what is waiting on ME (every staff member)
 *   Assigned    what the office asked of people: one card per       admins
 *               task with how many are done, documents out for
 *               signature, and repeating tasks with their grid
 *   Templates   saved tasks to assign again                          admins
 *
 * Everything the school asks of anybody is one kind of thing since
 * 2026-09-24 (iCreate meeting 2026-09-23). Requests are gone: families and
 * staff message the school, and the office turns a message into a task.
 * Forms are gone with them, and so is the Requests tab. My documents and
 * Secure documents moved to the Library's Documents area -- they are things
 * the school keeps, not things anybody was asked to do -- and their old
 * ?tab= links redirect there.
 *
 * Every office endpoint is gated server-side (ADMIN_ROLES), so showing the
 * office's tabs only to admins is chrome.
 *
 * "Report an incident" is the one thing every staff member can START here
 * (ticket a26d9daf, 2026-09-24): it files a task for an office person, and the
 * reporter finds it again under "Incident reports you filed" on My tasks.
 */

const OWN_TABS = [['mine', 'My tasks']]
const OFFICE_TABS = [['assigned', 'Assigned'], ['templates', 'Templates']]

// Tabs that moved to the Library, and where each landed.
const MOVED = { documents: 'mine', secure: 'secure' }

const TasksPage = () => {
  const { user } = useAuth()
  const { orgId } = useSisOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const [preview] = useState(() => getPreviewTeacher())
  const admin = isSisAdmin(user)
  const hr = canSeeHr(user)
  const TABS = [...OWN_TABS, ...(admin ? OFFICE_TABS : [])]
  const rawTab = searchParams.get('tab')
  // An unknown ?tab= (a bookmark to Requests, an office tab reached by
  // somebody who is not an admin) lands on My tasks.
  const tab = TABS.some(([t]) => t === rawTab) ? rawTab : 'mine'
  const openTaskId = searchParams.get('task')
  const sigEndpoint = hr ? '/api/sis/secure-documents/signature-requests'
    : '/api/sis/staff-admin/signature-requests'

  const [creating, setCreating] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [counts, setCounts] = useState({})

  const countAssigned = useCallback((n) => setCounts((p) => (p.assigned === n ? p : { ...p, assigned: n })), [])

  // The Assigned tab's badge is what needs the OFFICE (steps waiting on an
  // approval). When the tab is not mounted it cannot report, so ask here.
  useEffect(() => {
    if (!orgId || !admin || tab === 'assigned') return
    api.get(withOrg('/api/sis/tasks/assigned', orgId))
      .then((r) => countAssigned((r.data?.batches || [])
        .reduce((n, b) => n + (b.awaiting_review || 0), 0)))
      .catch(() => {})
  }, [orgId, admin, tab, refreshKey, countAssigned])

  if (MOVED[rawTab]) {
    const params = new URLSearchParams(searchParams)
    params.set('tab', 'documents')
    params.set('docs', MOVED[rawTab])
    return <Navigate to={`/library?${params.toString()}`} replace />
  }

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === 'mine') params.delete('tab')
    else params.set('tab', next)
    params.delete('task')
    setSearchParams(params, { replace: true })
  }

  const afterAssign = () => {
    setRefreshKey((k) => k + 1)
    setCreating(false)
    setTab('assigned')
  }

  return (
    <div className="space-y-6">
      <div>
        <BackToDashboard className="mb-1" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-neutral-900">Tasks</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <ReportIncidentButton orgId={orgId} onFiled={() => setRefreshKey((k) => k + 1)} />
            {admin && (
              <button type="button" onClick={() => setCreating(true)}
                className="px-4 py-2 rounded-lg bg-gradient-primary text-white text-sm font-semibold">
                Assign a task
              </button>
            )}
          </div>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          {admin
            ? 'What is waiting on you, what you have asked of staff, families and students, and the templates you reuse.'
            : 'Everything the school is waiting on you for: tasks, documents to sign and policies to read.'}
        </p>
      </div>

      {TABS.length > 1 && (
        <GlassTabBar
          align="start" size="md" aria-label="Tasks sections"
          tabs={TABS.map(([value, label]) => ({ id: value, label, badge: counts[value] || null }))}
          active={tab} onSelect={setTab}
        />
      )}

      {tab === 'mine' && <MyTaskInbox key={refreshKey} orgId={orgId} preview={preview} openTaskId={openTaskId} />}
      {tab === 'mine' && <MyIncidentReports orgId={orgId} reloadKey={refreshKey} />}
      {admin && tab === 'assigned' && (
        <AssignedWork orgId={orgId} sigEndpoint={sigEndpoint}
          reloadKey={refreshKey} onCount={countAssigned} />
      )}
      {admin && tab === 'templates' && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <TaskTemplatesManager orgId={orgId} embedded open
            onChanged={() => setRefreshKey((k) => k + 1)} />
        </div>
      )}

      {creating && (
        <AssignComposer orgId={orgId} sigEndpoint={sigEndpoint} allowHr={hr}
          onClose={() => setCreating(false)} onAssigned={afterAssign} />
      )}
    </div>
  )
}

export default TasksPage
