import React, { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSisOrg } from './useSisOrg'
import { useAuth } from '../../contexts/AuthContext'
import { canSeeHr, isSisAdmin } from './sisRole'
import { getPreviewTeacher } from './teacherPreview'
import { isPathHidden } from './sisModules'
import BackToDashboard from '../../components/sis/BackToDashboard'
import GlassTabBar from '../../components/ui/GlassTabBar'
import DocumentsPanel from './libraryPage/DocumentsPanel'
import TrainingPanel from './libraryPage/TrainingPanel'
import CurriculumPanel from './libraryPage/CurriculumPanel'
import QuestsPanel from './libraryPage/QuestsPanel'
import { MyDocumentsPanel } from './MyDocumentsPage'
import { SecureDocumentsPanel } from './SecureDocumentsPage'

/**
 * Library -- what the school keeps for people to read, do and teach from:
 *
 *   Documents   the school-wide document library: handbook, contract, links,
 *               with acknowledgments                          everyone
 *               ...and, as its own views, My documents (what the school
 *               shared with me, what I sent in)               staff
 *               and Secure documents (the HR store)           HR only
 *   Training    quests and links the school sets, with progress; for admins
 *               the audiences and who has done what            everyone
 *   Curriculum  subject entries pointing at their Drive folder, carrying
 *               quests and courses, attached to classes        admins
 *   Quests      every quest the school owns, and where it is in use   admins
 *
 * Until 2026-09-18 these were four pages under "Operations" (Resources,
 * Curriculum, Quests, Training). Curriculum and Quests are one thing seen
 * twice -- a quest lives on a curriculum, and the Quests page existed only
 * because a quest on no curriculum was unreachable. Resources and Training
 * already share a table (a training link is an org_resources row) and a
 * shape: something the school gives a person, narrowed to an audience, with
 * a done state. Nothing was joined across the four pages, and every admin
 * endpoint is gated server-side, so showing the office's tabs only to admins
 * loses nothing. Same pattern as Classes (M21) and Tasks (M20): the person's
 * own tabs first, the office's after.
 *
 * Called Library rather than Resources: families already use "Resources" for
 * the document list on their side, and a Documents tab inside a page named
 * Resources muddles the one word the two sides share.
 *
 * Everyone lands on Documents. Old paths (/resources, /training, /curriculum,
 * /quest-library) redirect here with their query strings, so the task inbox's
 * links, the dashboards' "All resources" and a quest's curriculum chip
 * (?curriculum=<id>) still land on the tab and the row.
 */

// [key, label, the old path whose module gates the tab]. A tab whose module
// the org turned off is not offered (sisModules): the config is a promise
// already made under the old path's name.
const OWN_TABS = [
  ['documents', 'Documents', null],
  ['training', 'Training', '/training'],
]

const OFFICE_TABS = [
  ['curriculum', 'Curriculum', '/curriculum'],
  ['quests', 'Quests', '/quest-library'],
]

// The Documents tab's views. My documents and Secure documents were tabs of
// the Tasks page until 2026-09-24 (iCreate meeting 2026-09-23): documents are
// something the school keeps, not something anybody was asked to do. The
// secure store stays HR-only, as it was; /tasks?tab=documents|secure and
// /secure-documents redirect here.
const DOC_VIEWS = [
  ['library', 'School library', '/resources'],
  ['mine', 'My documents', '/secure-documents'],
  ['secure', 'Secure documents', '/secure-documents'],
]

function DocumentsArea({ orgId, hr, activeOrg, view, onView }) {
  const [preview] = useState(() => getPreviewTeacher())
  const views = DOC_VIEWS
    .filter(([key, , modulePath]) => !isPathHidden(modulePath, activeOrg) && (key !== 'secure' || hr))
  const current = views.some(([k]) => k === view) ? view : (preview ? 'mine' : views[0]?.[0])
  if (!views.length) return <p className="text-neutral-500">Nothing here is turned on for this school.</p>
  return (
    <div className="space-y-4">
      {views.length > 1 && (
        <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-white" role="group" aria-label="Documents">
          {views.map(([key, label]) => (
            <button key={key} type="button" onClick={() => onView(key)} aria-pressed={current === key}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                current === key ? 'bg-optio-purple text-white' : 'text-neutral-600 hover:bg-neutral-50'}`}>
              {label}
            </button>
          ))}
        </div>
      )}
      {current === 'library' && <DocumentsPanel />}
      {current === 'mine' && <MyDocumentsPanel orgId={orgId} preview={preview} />}
      {current === 'secure' && hr && <SecureDocumentsPanel orgId={orgId} />}
    </div>
  )
}

const LibraryPage = () => {
  const { user } = useAuth()
  const { orgId, activeOrg } = useSisOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const admin = isSisAdmin(user)
  const hr = canSeeHr(user)
  const docsOn = DOC_VIEWS.some(([, , p]) => !isPathHidden(p, activeOrg))
  const TABS = [...OWN_TABS, ...(admin ? OFFICE_TABS : [])]
    .filter(([key, , modulePath]) => (key === 'documents' ? docsOn : !isPathHidden(modulePath, activeOrg)))
  // An unknown ?tab= (an office tab reached by a teacher, a tab whose module
  // is off) lands on the first tab the reader has.
  const fallback = TABS[0]?.[0] || 'documents'
  const rawTab = searchParams.get('tab')
  const tab = TABS.some(([t]) => t === rawTab) ? rawTab : fallback

  const setTab = (next) => {
    const params = new URLSearchParams(searchParams)
    if (next === fallback) params.delete('tab')
    else params.set('tab', next)
    // Deep-link state belongs to its own tab.
    if (next !== 'curriculum') params.delete('curriculum')
    if (next !== 'documents') { params.delete('highlight'); params.delete('docs') }
    setSearchParams(params, { replace: true })
  }

  const setDocsView = (next) => {
    const params = new URLSearchParams(searchParams)
    params.set('tab', 'documents')
    if (next === 'library') params.delete('docs')
    else params.set('docs', next)
    setSearchParams(params, { replace: true })
  }

  return (
    <div>
      <BackToDashboard className="mb-1" />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-neutral-900">Library</h1>
      </div>

      {TABS.length === 0 ? (
        <p className="text-neutral-500">Nothing here is turned on for this school.</p>
      ) : (
        <GlassTabBar
          align="start" size="md" className="mb-5" aria-label="Library sections"
          tabs={TABS.map(([id, label]) => ({ id, label }))}
          active={tab} onSelect={setTab}
        />
      )}

      {tab === 'documents' && (
        <DocumentsArea orgId={orgId} hr={hr} activeOrg={activeOrg}
          view={searchParams.get('docs') || 'library'} onView={setDocsView} />
      )}
      {tab === 'training' && <TrainingPanel />}
      {admin && tab === 'curriculum' && <CurriculumPanel />}
      {admin && tab === 'quests' && <QuestsPanel />}
    </div>
  )
}

export default LibraryPage
