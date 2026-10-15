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

const sis = (o) => ({ ...o, feature_flags: {} })

const ORGS = [
  sis({ id: 'org-a', name: 'Aardvark Academy', slug: 'aardvark' }),
  sis({ id: 'org-i', name: 'iCreate', slug: 'icreate' }),
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

describe('sisOrgStore offers every org (every org is an SIS org since 2026-10-15)', () => {
  beforeEach(() => localStorage.clear())

  it('lists an org that never carried the old sis_enabled flag', async () => {
    const store = await freshStore()
    store.setOrgs([...ORGS, { id: 'org-x', name: 'No Flags Here', slug: 'noflags' }])
    expect(store.getSnapshot().orgs.map((o) => o.id)).toEqual(['org-a', 'org-i', 'org-x'])
  })

  it('lists an org whose old sis_enabled flag is false', async () => {
    const store = await freshStore()
    store.setOrgs([{ id: 'org-x', name: 'Off', feature_flags: { sis_enabled: false } }])
    expect(store.getSnapshot().orgs.map((o) => o.id)).toEqual(['org-x'])
    expect(store.getSnapshot().orgId).toBe('org-x')
  })

  it('drops a remembered selection whose org is no longer in the list', async () => {
    localStorage.setItem('optio_sis_org_id', 'org-gone')
    const store = await freshStore()
    store.setOrgs(ORGS)
    // Falls back to the normal default rather than staying on an org the
    // dropdown can no longer show.
    expect(store.getSnapshot().orgId).toBe('org-i')
    expect(localStorage.getItem('optio_sis_org_id')).toBe('org-i')
  })

  it('keeps a remembered selection that is still on offer', async () => {
    localStorage.setItem('optio_sis_org_id', 'org-a')
    const store = await freshStore()
    store.setOrgs(ORGS)
    expect(store.getSnapshot().orgId).toBe('org-a')
  })

  it('selects nothing, and forgets the old id, when the list is empty', async () => {
    localStorage.setItem('optio_sis_org_id', 'org-a')
    const store = await freshStore()
    store.setOrgs([])
    expect(store.getSnapshot().orgId).toBeNull()
    expect(localStorage.getItem('optio_sis_org_id')).toBeNull()
  })
})
