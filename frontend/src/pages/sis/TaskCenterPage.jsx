import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeHr } from './sisRole'
import BackToDashboard from '../../components/sis/BackToDashboard'
import ModalOverlay from '../../components/ui/ModalOverlay'
import AssignComposer from '../../components/sis/tasks/AssignComposer'
import AssignChecklistModal from '../../components/sis/tasks/AssignChecklistModal'
import AssignedWork from '../../components/sis/tasks/AssignedWork'
import FormRoutingModal from '../../components/sis/tasks/FormRoutingModal'
import { AdminQueue, SubmitForm } from './StaffFormsPage'
import FormBuilder from '../../components/sis/tasks/FormBuilder'
import { awaitingReviewOf } from './OnboardingPage'
import { SecureDocumentsPanel } from './SecureDocumentsPage'
import { isPathHidden } from './sisModules'

/**
 * Task Center — organized by direction, because that is how the office thinks:
 *
 *   Requests   what people send US (the queue, plus the forms that shape it)
 *   Assigned   what WE asked of people — tasks, checklists and documents out
 *              for signature, one list (they are one table underneath)
 *   Documents  the filing cabinet (the HR-only secure store)
 *
 * Five nouns used to live here — requests, tasks, checklists, forms, paperwork
 * — and neither iCreate's admin nor ours could say what did what (2026-08-31).
 * They were tabs by record type, which is the implementation's view. The two
 * verbs the office actually has are "someone asked us" and "we asked someone";
 * everything else is an option inside the Assign composer, not a concept to
 * learn first.
 *
 * Authoring (request forms, checklist templates) is collapsed inside the tab
 * whose output it shapes — rare acts must not sit on top of daily triage.
 *
 * HR paperwork is the same send with sensitivity='hr' on the HR-gated
 * endpoints. A campus coordinator sees campus paperwork in Assigned and no
 * Documents tab at all; both enforced server-side, this is just the chrome.
 */

// The Documents tab exists only for HR — for everyone else the store is not
// theirs to see and the tab would be empty chrome.
const tabsFor = (hr) => [
  ['requests', 'Requests'],
  ['assigned', 'Assigned'],
  ...(hr ? [['documents', 'Documents']] : []),
]

// Every tab name this page has ever had, mapped to where that work lives now —
// old notification links and bookmarks must keep landing on the right list.
const LEGACY_TABS = { checklists: 'assigned', tasks: 'assigned', paperwork: 'assigned' }

const CREATE_ACTIONS = [
  ['assign', 'Assign a task'],
  ['request', 'New request'],
]

const PRIMARY_ACTION = {
  requests: 'request',
  assigned: 'assign',
  documents: 'assign',
}

const TaskCenterPage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin, activeOrg } = useSisOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const hr = canSeeHr(user)
  const showDocuments = hr && !isPathHidden('/secure-documents', activeOrg)
  const TABS = tabsFor(showDocuments)
  const rawTab = searchParams.get('tab')
  const mapped = TABS.some(([t]) => t === rawTab) ? rawTab : LEGACY_TABS[rawTab]
  const tab = TABS.some(([t]) => t === mapped) ? mapped : 'requests'
  const openSubmissionId = searchParams.get('submission')
  const sigEndpoint = hr ? '/api/sis/secure-documents/signature-requests'
    : '/api/sis/staff-admin/signature-requests'

  const [staff, setStaff] = useState([])
  const [formTypes, setFormTypes] = useState({})
  const [creating, setCreating] = useState(null) // null | 'assign' | 'request' | 'checklist'
  const [menuOpen, setMenuOpen] = useState(false)
  const [routing, setRouting] = useState(false)   // "Where requests go" editor
  const [manageFormsOpen, setManageFormsOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)
  const [counts, setCounts] = useState({})

  useEffect(() => {
    if (!orgId) return
    api.get(withOrg('/api/sis/staff', orgId))
      .then((r) => setStaff(r.data?.staff || []))
      .catch(() => setStaff([]))
    api.get(withOrg('/api/sis/teacher/forms', orgId))
      .then((r) => setFormTypes(r.data?.form_types || {}))
      .catch(() => setFormTypes({}))
  }, [orgId])

  // Stable identities: each tab reports its own count while it is mounted, and
  // an unstable callback here would re-run the child's reporting effect forever.
  const countRequests = useCallback((n) => setCounts((p) => (p.requests === n ? p : { ...p, requests: n })), [])
  const countAssigned = useCallback((n) => setCounts((p) => (p.assigned === n ? p : { ...p, assigned: n })), [])

  // The tabs that are NOT mounted cannot report, so fetch theirs here. Skipping
  // the active one keeps this from duplicating the request the tab itself makes.
  // Counts are what needs the OFFICE: open requests, finished items awaiting an
  // approval — not work that is waiting on other people.
  useEffect(() => {
    if (!orgId) return
    if (tab !== 'requests') {
      api.get(withOrg('/api/sis/staff-admin/forms?status=open', orgId))
        .then((r) => countRequests(r.data?.counts?.open ?? 0)).catch(() => {})
    }
    if (tab !== 'assigned') {
      api.get(withOrg('/api/sis/staff-admin/onboarding/assignments', orgId))
        .then((r) => countAssigned(awaitingReviewOf(r.data?.assignments || []).length))
        .catch(() => {})
    }
  }, [orgId, tab, refreshKey, countRequests, countAssigned])

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    // A deep-linked request belongs to the Requests tab; leaving the id in the
    // URL after a tab change would re-highlight it on the way back.
    if (next !== 'requests') params.delete('submission')
    setSearchParams(params, { replace: true })
  }

  const primaryAction = PRIMARY_ACTION[tab] || 'request'
  const primaryLabel = (CREATE_ACTIONS.find(([a]) => a === primaryAction) || [])[1]

  const startCreating = (action) => {
    setMenuOpen(false)
    setCreating(action)
  }

  const afterCreate = (landOn) => {
    setRefreshKey((k) => k + 1)
    setCreating(null)
    if (landOn) setTab(landOn)
  }

  return (
    <div className="space-y-6">
      <div>
        <BackToDashboard className="mb-1" />
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold text-neutral-900">Task Center</h1>
          <div className="flex items-center gap-3">
            <div className="relative flex">
              <button onClick={() => startCreating(primaryAction)}
                className="px-4 py-2 rounded-l-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold">
                {primaryLabel}
              </button>
              <button onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-haspopup="menu"
                aria-label="Other things to assign or send"
                className="px-2 py-2 rounded-r-lg bg-gradient-to-r from-optio-pink to-optio-pink text-white text-sm font-semibold border-l border-white/30">
                <span className="text-xs" aria-hidden="true">▾</span>
              </button>
              {menuOpen && (
                <>
                  {/* Click-away. Behind the menu, above everything else. */}
                  <button className="fixed inset-0 z-10 cursor-default" aria-hidden="true" tabIndex={-1}
                    onClick={() => setMenuOpen(false)} />
                  <div role="menu"
                    className="absolute right-0 top-full mt-1 z-20 w-64 bg-white rounded-lg border border-gray-200 shadow-lg py-1">
                    {CREATE_ACTIONS.filter(([action]) => action !== primaryAction).map(([action, label]) => (
                      <button key={action} role="menuitem" onClick={() => startCreating(action)}
                        className="block w-full text-left px-3 py-2 text-sm text-neutral-700 hover:bg-gray-50">
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <SisOrgPicker isSuperadmin={isSuperadmin} orgs={orgs} orgId={orgId} setOrgId={setOrgId} />
          </div>
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          What people send the office, and what the office asks of people.
        </p>
      </div>

      <div className="flex items-center gap-2 border-b border-gray-200">
        {TABS.map(([value, label]) => {
          const n = counts[value]
          return (
            <button key={value} onClick={() => setTab(value)}
              className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === value
                  ? 'border-optio-purple text-optio-purple'
                  : 'border-transparent text-neutral-500 hover:text-neutral-800'}`}>
              {label}
              {n ? (
                <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${
                  tab === value ? 'bg-optio-purple/10 text-optio-purple' : 'bg-gray-100 text-neutral-600'}`}>
                  {n}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>

      {tab === 'requests' && (
        <div className="space-y-4">
          <AdminQueue key={`req-${refreshKey}`} orgId={orgId} staff={staff}
            openSubmissionId={openSubmissionId} onCount={countRequests} />
          {/* Authoring, collapsed to one row: the forms people file, and where
              each kind goes. A form template shapes a REQUEST, so it lives
              here, under the queue it feeds — not on top of it. */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={() => setManageFormsOpen((v) => !v)}
                aria-expanded={manageFormsOpen}
                className="flex items-center gap-2 font-semibold text-neutral-900">
                <span className={`text-neutral-400 text-xs transition-transform ${manageFormsOpen ? 'rotate-90' : ''}`}
                  aria-hidden="true">▶</span>
                Manage forms
              </button>
              <button onClick={() => setRouting(true)}
                className="text-sm text-optio-purple font-medium hover:underline">
                Where requests go
              </button>
            </div>
            {manageFormsOpen && (
              <div className="mt-3">
                <FormBuilder key={`forms-${refreshKey}`} orgId={orgId} staff={staff} />
              </div>
            )}
          </div>
        </div>
      )}
      {tab === 'assigned' && (
        <AssignedWork key={`asg-${refreshKey}`} orgId={orgId} sigEndpoint={sigEndpoint}
          reloadKey={refreshKey} onCount={countAssigned} />
      )}
      {tab === 'documents' && showDocuments && (
        <SecureDocumentsPanel key={`docs-${refreshKey}`} orgId={orgId} />
      )}

      {creating === 'request' && (
        <ModalOverlay onClose={() => setCreating(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
            role="dialog" aria-modal="true" aria-label="New request">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">New request</h2>
              <button onClick={() => setCreating(null)} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
            </div>
            <SubmitForm orgId={orgId} formTypes={formTypes} admin staff={staff} embedded
              onSubmitted={() => afterCreate('requests')} />
          </div>
        </ModalOverlay>
      )}

      {routing && (
        <FormRoutingModal orgId={orgId} staff={staff} onClose={() => setRouting(false)} />
      )}

      {creating === 'assign' && (
        <AssignComposer orgId={orgId} sigEndpoint={sigEndpoint} allowHr={hr}
          onClose={() => setCreating(null)}
          onAssigned={() => afterCreate('assigned')}
          onUseTemplate={() => setCreating('checklist')} />
      )}

      {creating === 'checklist' && (
        <AssignChecklistModal orgId={orgId} onClose={() => setCreating(null)}
          onAssigned={() => afterCreate('assigned')} />
      )}
    </div>
  )
}

export default TaskCenterPage
