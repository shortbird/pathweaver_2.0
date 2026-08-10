import { describe, it, expect, beforeEach, vi } from 'vitest'

/**
 * The shared "active organization" selection for superadmin surfaces (SIS
 * console org picker, school-page preview). The store keeps module-level
 * state, so each test imports a fresh copy.
 */
async function freshStore() {
  vi.resetModules()
  return await import('./sisOrgStore')
}

const ORGS = [
  { id: 'org-a', name: 'Aardvark Academy', slug: 'aardvark' },
  { id: 'org-i', name: 'iCreate', slug: 'icreate' },
]

describe('sisOrgStore default selection', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to iCreate when nothing was ever selected', async () => {
    const store = await freshStore()
    store.setOrgs(ORGS)
    expect(store.getSnapshot().orgId).toBe('org-i')
  })

  it('falls back to the first org when iCreate is not in the list', async () => {
    const store = await freshStore()
    store.setOrgs([ORGS[0]])
    expect(store.getSnapshot().orgId).toBe('org-a')
  })

  it('never overrides a selection the superadmin already made', async () => {
    localStorage.setItem('optio_sis_org_id', 'org-a')
    const store = await freshStore()
    store.setOrgs(ORGS)
    expect(store.getSnapshot().orgId).toBe('org-a')
  })

  it('persists a new selection', async () => {
    const store = await freshStore()
    store.setOrgs(ORGS)
    store.setOrgId('org-a')
    expect(localStorage.getItem('optio_sis_org_id')).toBe('org-a')
  })
})
