import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import SisOrgPicker from './SisOrgPicker'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeHr } from './sisRole'
import BackToDashboard from '../../components/sis/BackToDashboard'
import ModalOverlay from '../../components/ui/ModalOverlay'
import SendForSignatureModal from '../../components/sis/tasks/SendForSignatureModal'
import AssignChecklistModal from '../../components/sis/tasks/AssignChecklistModal'
import SignatureBatches from '../../components/sis/tasks/SignatureBatches'
import { AdminQueue, SubmitForm } from './StaffFormsPage'
import { AdminOnboarding } from './OnboardingPage'

/**
 * Task Center — the office's side of everything it asks people to do.
 *
 * Three tabs rather than one grid: a request has a status, an assignee and a
 * comment thread; a checklist is a template assigned to a person; a sent
 * document is one file and a list of who has signed it. They are genuinely
 * different records, and flattening them into one table would make all three
 * worse. What IS unified is the entry point — one page, one "Assign or send"
 * menu — so nobody has to know which of the three a piece of work belongs to
 * before they can start it.
 *
 * The tab labels carry counts because the bar is the triage surface: "Requests ·
 * Checklists · Sent paperwork" told an admin nothing about where the work was,
 * so finding it meant opening all three.
 *
 * HR paperwork is the same send flow with sensitivity='hr' on the HR-gated
 * endpoints. A campus coordinator reaches this page and sends campus paperwork;
 * the HR sends are neither listed nor sendable for them, enforced server-side.
 */

const TABS = [
  ['requests', 'Requests'],
  ['checklists', 'Checklists'],
  ['paperwork', 'Sent paperwork'],
]

// "form" leads the create action because it is the word staff use for these —
// teachers submit from a page called Forms — and it appeared nowhere on the
// admin side. The office looked at this menu, read "request or task", and
// concluded the console could not create a form at all (iCreate, 2026-08-20:
// "I see checklists in the task center, but no way to create a form"). Same
// record, same component, one vocabulary.
const CREATE_ACTIONS = [
  ['request', 'New form, request, or task'],
  ['checklist', 'Assign a checklist'],
  ['signature', 'Send a document for signature'],
]

const TaskCenterPage = () => {
  const { user } = useAuth()
  const { orgId, setOrgId, orgs, isSuperadmin } = useSisOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const tab = TABS.some(([t]) => t === searchParams.get('tab')) ? searchParams.get('tab') : 'requests'
  const openSubmissionId = searchParams.get('submission')
  const hr = canSeeHr(user)
  const sigEndpoint = hr ? '/api/sis/secure-documents/signature-requests'
    : '/api/sis/staff-admin/signature-requests'

  const [staff, setStaff] = useState([])
  const [formTypes, setFormTypes] = useState({})
  const [creating, setCreating] = useState(null) // null | 'request' | 'checklist' | 'signature'
  const [menuOpen, setMenuOpen] = useState(false)
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
  const countChecklists = useCallback((n) => setCounts((p) => (p.checklists === n ? p : { ...p, checklists: n })), [])
  const countPaperwork = useCallback((n) => setCounts((p) => (p.paperwork === n ? p : { ...p, paperwork: n })), [])

  // The tabs that are NOT mounted cannot report, so fetch theirs here. Skipping
  // the active one keeps this from duplicating the request the tab itself makes.
  useEffect(() => {
    if (!orgId) return
    if (tab !== 'requests') {
      api.get(withOrg('/api/sis/staff-admin/forms?status=open', orgId))
        .then((r) => countRequests(r.data?.counts?.open ?? 0)).catch(() => {})
    }
    if (tab !== 'checklists') {
      api.get(withOrg('/api/sis/staff-admin/onboarding/assignments', orgId))
        .then((r) => countChecklists((r.data?.assignments || []).reduce(
          (n, a) => n + (a.items || []).filter(
            (i) => i.needs_approval && i.status === 'complete').length, 0)))
        .catch(() => {})
    }
    if (tab !== 'paperwork') {
      api.get(withOrg(sigEndpoint, orgId))
        .then((r) => countPaperwork((r.data?.batches || []).filter(
          (b) => b.signed_count < b.total_count).length))
        .catch(() => {})
    }
  }, [orgId, tab, sigEndpoint, refreshKey, countRequests, countChecklists, countPaperwork])

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', next)
    // A deep-linked request belongs to the Requests tab; leaving the id in the
    // URL after a tab change would re-highlight it on the way back.
    if (next !== 'requests') params.delete('submission')
    setSearchParams(params, { replace: true })
  }

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
            <div className="relative">
              <button onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-haspopup="menu"
                className="px-4 py-2 rounded-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold">
                Assign or send
                <span className="ml-2 text-xs" aria-hidden="true">▾</span>
              </button>
              {menuOpen && (
                <>
                  {/* Click-away. Behind the menu, above everything else. */}
                  <button className="fixed inset-0 z-10 cursor-default" aria-hidden="true" tabIndex={-1}
                    onClick={() => setMenuOpen(false)} />
                  <div role="menu"
                    className="absolute right-0 mt-1 z-20 w-64 bg-white rounded-lg border border-gray-200 shadow-lg py-1">
                    {CREATE_ACTIONS.map(([action, label]) => (
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
          Forms, requests and tasks, onboarding checklists, and documents sent out for signature.
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
        <AdminQueue key={`req-${refreshKey}`} orgId={orgId} staff={staff}
          openSubmissionId={openSubmissionId} onCount={countRequests} />
      )}
      {tab === 'checklists' && (
        <AdminOnboarding key={`chk-${refreshKey}`} orgId={orgId} onCount={countChecklists} />
      )}
      {tab === 'paperwork' && (
        <SignatureBatches
          orgId={orgId}
          // HR sees every send including employment paperwork; the front
          // office sees campus paperwork. Two endpoints, one component.
          endpoint={sigEndpoint}
          reloadKey={refreshKey}
          onCount={countPaperwork}
        />
      )}

      {creating === 'request' && (
        <ModalOverlay onClose={() => setCreating(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 space-y-4"
            role="dialog" aria-modal="true" aria-label="New form, request, or task">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-neutral-900">New form, request, or task</h2>
              <button onClick={() => setCreating(null)} className="text-sm text-neutral-500 hover:text-neutral-800">Close</button>
            </div>
            <SubmitForm orgId={orgId} formTypes={formTypes} admin staff={staff} embedded
              onSubmitted={() => afterCreate('requests')} />
          </div>
        </ModalOverlay>
      )}

      {creating === 'checklist' && (
        <AssignChecklistModal orgId={orgId} onClose={() => setCreating(null)}
          onAssigned={() => afterCreate('checklists')} />
      )}

      {creating === 'signature' && (
        <SendForSignatureModal
          orgId={orgId}
          endpoint={sigEndpoint}
          allowHr={hr}
          onClose={() => setCreating(null)}
          onSent={() => afterCreate('paperwork')}
        />
      )}
    </div>
  )
}

export default TaskCenterPage
