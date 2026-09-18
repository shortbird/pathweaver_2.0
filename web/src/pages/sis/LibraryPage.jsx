import React from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSisOrg } from './useSisOrg'
import { useAuth } from '../../contexts/AuthContext'
import { isSisAdmin } from './sisRole'
import { isPathHidden } from './sisModules'
import BackToDashboard from '../../components/sis/BackToDashboard'
import GlassTabBar from '../../components/ui/GlassTabBar'
import DocumentsPanel from './libraryPage/DocumentsPanel'
import TrainingPanel from './libraryPage/TrainingPanel'
import CurriculumPanel from './libraryPage/CurriculumPanel'
import QuestsPanel from './libraryPage/QuestsPanel'

/**
 * Library -- what the school keeps for people to read, do and teach from:
 *
 *   Documents   the school-wide document library: handbook, contract, links,
 *               with acknowledgments                          everyone
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
  ['documents', 'Documents', '/resources'],
  ['training', 'Training', '/training'],
]

const OFFICE_TABS = [
  ['curriculum', 'Curriculum', '/curriculum'],
  ['quests', 'Quests', '/quest-library'],
]

const LibraryPage = () => {
  const { user } = useAuth()
  const { activeOrg } = useSisOrg()
  const [searchParams, setSearchParams] = useSearchParams()
  const admin = isSisAdmin(user)
  const TABS = [...OWN_TABS, ...(admin ? OFFICE_TABS : [])]
    .filter(([, , modulePath]) => !isPathHidden(modulePath, activeOrg))
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
    if (next !== 'documents') params.delete('highlight')
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

      {tab === 'documents' && <DocumentsPanel />}
      {tab === 'training' && <TrainingPanel />}
      {admin && tab === 'curriculum' && <CurriculumPanel />}
      {admin && tab === 'quests' && <QuestsPanel />}
    </div>
  )
}

export default LibraryPage
