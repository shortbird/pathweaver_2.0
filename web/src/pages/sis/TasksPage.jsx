import React, { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../services/api'
import { useSisOrg, withOrg } from './useSisOrg'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeHr, isSisAdmin } from './sisRole'
import { getPreviewTeacher } from './teacherPreview'
import BackToDashboard from '../../components/sis/BackToDashboard'
import ModalOverlay from '../../components/ui/ModalOverlay'
import MyTaskInbox from '../../components/sis/tasks/MyTaskInbox'
import { MyDocumentsPanel } from './MyDocumentsPage'
import AssignComposer from '../../components/sis/tasks/AssignComposer'
import AssignChecklistModal from '../../components/sis/tasks/AssignChecklistModal'
import AssignedWork from '../../components/sis/tasks/AssignedWork'
import FormRoutingModal from '../../components/sis/tasks/FormRoutingModal'
import { AdminQueue, SubmitForm } from './StaffFormsPage'
import PaperworkTemplatesManager from '../../components/sis/tasks/PaperworkTemplatesManager'
import { awaitingReviewOf } from '../../components/sis/tasks/ChecklistReview'
import { SecureDocumentsPanel } from './SecureDocumentsPage'
import { isPathHidden } from './sisModules'
import GlassTabBar from '../../components/ui/GlassTabBar'
import PopMenu from '../../components/sis/ui/PopMenu'

/**
 * Tasks -- one page, organized by direction, because that is how everyone
 * thinks about work:
 *
 *   My tasks      what is waiting on ME (every staff member; the inbox, or
 *                 the same rows grouped by checklist)
 *   My documents  what the school shared with me and what I sent in
 *   Requests      what people send the OFFICE (the queue)          admins
 *   Assigned      what the office asked of people -- tasks,        admins
 *                 checklists and documents out for signature, one
 *                 list (they are one table underneath)
 *   Templates     the forms and checklists that shape both         admins
 *   Secure documents  the filing cabinet (the HR-only store)       HR
 *
 * Until 2026-09-17 these were two pages and a third door: My Tasks for the
 * person, Task Center for the office, and /onboarding for the person's
 * checklist. The two verbs -- "someone asked me" and "we asked someone" --
 * are tabs of one page now; nothing was joined across them, and every
 * office endpoint is gated server-side (ADMIN_ROLES / HR_ROLES), so showing
 * the office tabs only to admins loses nothing. A checklist item is a task,
 * so the checklist is a view of My tasks, not a page.
 *
 * Five nouns used to live on the office side -- requests, tasks, checklists,
 * forms, paperwork -- and neither iCreate's admin nor ours could say what did
 * what (2026-08-31). They were tabs by record type, which is the
 * implementation's view; everything but the two verbs is an option inside
 * the Assign composer, not a concept to learn first. Authoring got its own
 * tab back because collapsed inside Requests it was unfindable (iCreate
 * 51efdb7c).
 *
 * HR paperwork is the same send with sensitivity='hr' on the HR-gated
 * endpoints. A campus coordinator sees campus paperwork in Assigned and no
 * Secure documents tab at all; both enforced server-side, this is just the
 * chrome.
 */

const OWN_TABS = [['mine', 'My tasks'], ['documents', 'My documents']]

// The office's tabs. Secure documents exists only for HR -- for everyone else
// the store is not theirs to see and the tab would be empty chrome.
const officeTabsFor = (hr) => [
  ['requests', 'Requests'],
  ['assigned', 'Assigned'],
  ['templates', 'Templates'],
  ...(hr ? [['secure', 'Secure documents']] : []),
]

const CREATE_ACTIONS = [
  ['assign', 'Assign a task'],
  ['request', 'New request'],
  ['form_template', 'New form template'],
]

const PRIMARY_ACTION = {
  requests: 'request',
}

const TasksPage = () => {
  const { user } = useAuth()
  const { orgId, activeOrg } = useSisOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const [preview] = useState(() => getPreviewTeacher())
  const admin = isSisAdmin(user)
  const hr = canSeeHr(user)
  const showSecure = hr && !isPathHidden('/secure-documents', activeOrg)
  // An org that hid the onboarding module keeps the checklist view hidden:
  // the config is a promise already made (sisModules).
  const checklistHidden = isPathHidden('/onboarding', activeOrg)
  const TABS = [...OWN_TABS, ...(admin ? officeTabsFor(showSecure) : [])]
  // An unknown ?tab= (a bookmark from before the pages merged, an office tab
  // reached by somebody who is not an admin) lands on My tasks. A teacher
  // preview lands on My documents, which supports it; the inbox cannot.
  const rawTab = searchParams.get('tab')
  const tab = TABS.some(([t]) => t === rawTab) ? rawTab : (preview ? 'documents' : 'mine')
  const view = searchParams.get('view') === 'checklist' ? 'checklist' : 'list'
  const openItemKey = searchParams.get('item')
  const openSubmissionId = searchParams.get('submission')
  const sigEndpoint = hr ? '/api/sis/secure-documents/signature-requests'
    : '/api/sis/staff-admin/signature-requests'

  const [staff, setStaff] = useState([])
  const [formTypes, setFormTypes] = useState({})
  const [creating, setCreating] = useState(null) // null | 'assign' | 'request' | 'checklist' | 'form_template'
  const [menuOpen, setMenuOpen] = useState(false)
  const [routing, setRouting] = useState(false)   // "Where requests go" editor
  const [refreshKey, setRefreshKey] = useState(0)
  const [counts, setCounts] = useState({})

  // ?manage_forms=1 predates the Templates tab and is still in the wild
  // (notification links, the settings page). It now means "that tab".
  const wantsTemplates = admin && searchParams.get('manage_forms') === '1'
  useEffect(() => {
    if (wantsTemplates && tab !== 'templates') setTab('templates')
  }, [wantsTemplates, tab])

  useEffect(() => {
    if (!orgId || !admin) return
    api.get(withOrg('/api/sis/staff', orgId))
      .then((r) => setStaff(r.data?.staff || []))
      .catch(() => setStaff([]))
    api.get(withOrg('/api/sis/teacher/forms', orgId))
      .then((r) => setFormTypes(r.data?.form_types || {}))
      .catch(() => setFormTypes({}))
  }, [orgId, admin])

  // Stable identities: each tab reports its own count while it is mounted, and
  // an unstable callback here would re-run the child's reporting effect forever.
  const countRequests = useCallback((n) => setCounts((p) => (p.requests === n ? p : { ...p, requests: n })), [])
  const countAssigned = useCallback((n) => setCounts((p) => (p.assigned === n ? p : { ...p, assigned: n })), [])

  // The office tabs that are NOT mounted cannot report, so fetch theirs here.
  // Skipping the active one keeps this from duplicating the request the tab
  // itself makes. Counts are what needs the OFFICE: open requests, finished
  // items awaiting an approval -- not work that is waiting on other people.
  useEffect(() => {
    if (!orgId || !admin) return
    if (tab !== 'requests') {
      api.get(withOrg('/api/sis/staff-admin/forms?status=open', orgId))
        .then((r) => countRequests(r.data?.counts?.open ?? 0)).catch(() => {})
    }
    if (tab !== 'assigned') {
      api.get(withOrg('/api/sis/staff-admin/onboarding/assignments', orgId))
        .then((r) => countAssigned(awaitingReviewOf(r.data?.assignments || []).length))
        .catch(() => {})
    }
  }, [orgId, admin, tab, refreshKey, countRequests, countAssigned])

  const setParams = (patch) => {
    const params = new URLSearchParams(searchParams)
    Object.entries(patch).forEach(([k, v]) => (v == null ? params.delete(k) : params.set(k, v)))
    setSearchParams(params, { replace: true })
  }

  const setTab = (next) => {
    // A deep-linked request belongs to the Requests tab; leaving the id in the
    // URL after a tab change would re-highlight it on the way back. The
    // checklist view and its item belong to My tasks the same way.
    setParams({
      tab: next === 'mine' && !preview ? null : next,
      submission: next === 'requests' ? searchParams.get('submission') : null,
      view: next === 'mine' ? searchParams.get('view') : null,
      item: next === 'mine' ? searchParams.get('item') : null,
    })
  }

  const setView = (next) => setParams({ view: next === 'checklist' ? 'checklist' : null })

  const primaryAction = PRIMARY_ACTION[tab] || 'assign'
  const primaryLabel = (CREATE_ACTIONS.find(([a]) => a === primaryAction) || [])[1]

  const startCreating = (action) => {
    setMenuOpen(false)
    if (action === 'form_template') {
      setTab('templates')
      setCreating('form_template')
      return
    }
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
          <h1 className="text-2xl font-bold text-neutral-900">
            {preview && tab === 'documents' ? `${preview.name}'s documents` : 'Tasks'}
          </h1>
          {admin && (
            <PopMenu open={menuOpen} onClose={() => setMenuOpen(false)} width="w-64" className="flex"
              trigger={(<>
                <button onClick={() => startCreating(primaryAction)}
                  className="px-4 py-2 rounded-l-lg bg-gradient-to-r from-optio-purple to-optio-pink text-white text-sm font-semibold">
                  {primaryLabel}
                </button>
                <button onClick={() => setMenuOpen((v) => !v)} aria-expanded={menuOpen} aria-haspopup="menu"
                  aria-label="Other things to assign or send"
                  className="px-2 py-2 rounded-r-lg bg-gradient-to-r from-optio-pink to-optio-pink text-white text-sm font-semibold border-l border-white/30">
                  <span className="text-xs" aria-hidden="true">▾</span>
                </button>
              </>)}
              items={CREATE_ACTIONS.filter(([action]) => action !== primaryAction)
                .map(([action, label]) => ({ label, onClick: () => startCreating(action) }))} />
          )}
        </div>
        <p className="text-sm text-neutral-500 mt-1">
          {admin
            ? 'Everything waiting on you and your documents; then what people send the office, and what the office asks of people — tasks, checklists and documents for signature are all under Assigned.'
            : 'Everything waiting on you — documents to sign, checklists, requests and policies to read — and your documents: what the school shared with you, and what you send back.'}
        </p>
      </div>

      <GlassTabBar
        align="start" size="md" aria-label="Tasks sections"
        tabs={TABS.map(([value, label]) => ({ id: value, label, badge: counts[value] || null }))}
        active={tab} onSelect={setTab}
      />

      {tab === 'mine' && (
        <MyTaskInbox orgId={orgId} preview={preview} view={view} onViewChange={setView}
          openItemKey={openItemKey} checklistHidden={checklistHidden} />
      )}
      {tab === 'documents' && <MyDocumentsPanel orgId={orgId} preview={preview} />}

      {admin && tab === 'requests' && (
        <div className="space-y-4">
          <AdminQueue key={`req-${refreshKey}`} orgId={orgId} staff={staff}
            openSubmissionId={openSubmissionId} onCount={countRequests} />
          <div className="flex justify-end px-1">
            <button onClick={() => setTab('templates')}
              className="text-sm text-optio-purple font-medium hover:underline">
              Manage forms and checklist templates
            </button>
          </div>
        </div>
      )}
      {admin && tab === 'templates' && (
        <div className="space-y-4">
          {/* Authoring: paperwork templates (forms and checklists) and request routing */}
          <div className="space-y-2">
            {/* ONE tabbed manager for forms and checklist templates (ticket
                b0d6324a), replacing the two separate sections. Open on arrival
                now that this tab exists only to hold it -- a collapsed
                accordion behind a tab called Templates is one click of nothing.
                initialEditing still points it at a new form, so "New form
                template" in the action menu lands where it always did. */}
            <PaperworkTemplatesManager
              key={`forms-${refreshKey}`} orgId={orgId} staff={staff}
              title="Paperwork templates (Manage forms)" defaultTab="forms"
              initiallyOpen
              initialEditing={creating === 'form_template' ? 'new' : null}
            />
            <div className="flex justify-end px-1">
              <button onClick={() => setRouting(true)}
                className="text-sm text-optio-purple font-medium hover:underline">
                Where requests go
              </button>
            </div>
          </div>
        </div>
      )}
      {admin && tab === 'assigned' && (
        <AssignedWork key={`asg-${refreshKey}`} orgId={orgId} sigEndpoint={sigEndpoint}
          reloadKey={refreshKey} onCount={countAssigned} />
      )}
      {admin && tab === 'secure' && showSecure && (
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

export default TasksPage
