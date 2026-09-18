import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render as rtlRender, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom'

import LibraryPage from './LibraryPage'

// The shell is under test, not the four bodies: each panel has its own
// suite (resourcesPreview, staffTraining*, curriculum*, questLibraryPage).
vi.mock('./libraryPage/DocumentsPanel', () => ({ default: () => <div>DOCUMENTS PANEL</div> }))
vi.mock('./libraryPage/TrainingPanel', () => ({ default: () => <div>TRAINING PANEL</div> }))
vi.mock('./libraryPage/CurriculumPanel', () => ({ default: () => <div>CURRICULUM PANEL</div> }))
vi.mock('./libraryPage/QuestsPanel', () => ({ default: () => <div>QUESTS PANEL</div> }))
vi.mock('../../components/sis/BackToDashboard', () => ({ default: () => null }))

let authState = { user: { id: 'u1', role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin'] } }
vi.mock('../../contexts/AuthContext', () => ({ useAuth: () => authState }))

// A SIS org with nothing hidden; tests swap in one with hidden_modules.
let activeOrg = { id: 'org-1', feature_flags: { sis_enabled: true, sis_settings: {} } }
vi.mock('./useSisOrg', () => ({
  useSisOrg: () => ({ orgId: activeOrg?.id || null, activeOrg, orgs: [], setOrgId: vi.fn(), isSuperadmin: false, loading: false }),
  withOrg: (p) => p,
}))

const Where = () => {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname}{loc.search}</div>
}

const render = (entry = '/library') => rtlRender(
  <MemoryRouter initialEntries={[entry]}>
    <Routes>
      <Route path="/library" element={<><LibraryPage /><Where /></>} />
    </Routes>
  </MemoryRouter>,
)

const asTeacher = () => { authState = { user: { id: 'u2', role: 'org_managed', org_role: 'advisor', org_roles: ['advisor'] } } }
const tabNames = () => screen.getAllByRole('tab').map((t) => t.textContent)

beforeEach(() => {
  authState = { user: { id: 'u1', role: 'org_managed', org_role: 'org_admin', org_roles: ['org_admin'] } }
  activeOrg = { id: 'org-1', feature_flags: { sis_enabled: true, sis_settings: {} } }
})

describe('LibraryPage', () => {
  it('gives an admin four tabs and lands on Documents', () => {
    render()
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument()
    expect(tabNames()).toEqual(['Documents', 'Training', 'Curriculum', 'Quests'])
    expect(screen.getByText('DOCUMENTS PANEL')).toBeInTheDocument()
  })

  it('gives a teacher their two tabs and none of the office', () => {
    asTeacher()
    render()
    expect(tabNames()).toEqual(['Documents', 'Training'])
    expect(screen.queryByText('CURRICULUM PANEL')).not.toBeInTheDocument()
  })

  it('opens the tab named in the URL, with its deep link', () => {
    render('/library?tab=curriculum&curriculum=cur-art')
    expect(screen.getByText('CURRICULUM PANEL')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/library?tab=curriculum&curriculum=cur-art')
  })

  it('lands a teacher who follows an office link on their first tab', () => {
    asTeacher()
    render('/library?tab=quests')
    expect(screen.getByText('DOCUMENTS PANEL')).toBeInTheDocument()
    expect(screen.queryByText('QUESTS PANEL')).not.toBeInTheDocument()
  })

  it('writes the tab to the URL and drops the other tab\'s deep-link state', () => {
    render('/library?tab=curriculum&curriculum=cur-art')
    fireEvent.click(screen.getByRole('tab', { name: 'Quests' }))
    expect(screen.getByText('QUESTS PANEL')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('/library?tab=quests')
    expect(screen.getByTestId('where')).not.toHaveTextContent('curriculum=cur-art')
    // Back to the default tab: no ?tab= at all.
    fireEvent.click(screen.getByRole('tab', { name: 'Documents' }))
    expect(screen.getByTestId('where')).toHaveTextContent('/library')
    expect(screen.getByTestId('where')).not.toHaveTextContent('?')
  })

  it('hides a tab whose module the org turned off, and falls through to the next', () => {
    // An org that hid resources (Optio Academy hides several operational
    // modules) has no Documents tab; the page opens on Training.
    activeOrg = { id: 'org-1', feature_flags: { sis_enabled: true, sis_settings: { hidden_modules: ['resources'] } } }
    render()
    expect(tabNames()).toEqual(['Training', 'Curriculum', 'Quests'])
    expect(screen.getByText('TRAINING PANEL')).toBeInTheDocument()
    // Curriculum and Quests share the one module.
    activeOrg = { id: 'org-1', feature_flags: { sis_enabled: true, sis_settings: { hidden_modules: ['curriculum'] } } }
    rtlRender(<MemoryRouter><LibraryPage /></MemoryRouter>)
    expect(screen.getAllByRole('tab').map((t) => t.textContent).slice(-2)).toEqual(['Documents', 'Training'])
  })
})

describe('the old paths', () => {
  // The redirects live in SisRoutes; this pins their shape without mounting
  // the whole router: each old path becomes /library?tab=<its tab> with the
  // query string it arrived with.
  it('are listed as redirects to their tab in SisRoutes', async () => {
    const fs = await import('fs')
    const path = await import('path')
    const { fileURLToPath } = await import('url')
    const here = path.dirname(fileURLToPath(import.meta.url))
    const src = fs.readFileSync(path.join(here, '../../sis/SisRoutes.jsx'), 'utf8')
    for (const [old, tab] of [['resources', 'documents'], ['training', 'training'], ['curriculum', 'curriculum'], ['quest-library', 'quests']]) {
      expect(src, `/${old} should redirect to the ${tab} tab`)
        .toMatch(new RegExp(`<Route path="${old}" element={<LibraryRedirect tab="${tab}" />} />`))
    }
    expect(src).toMatch(/<Route path="library" element=/)
  })
})
