import { describe, it, expect } from 'vitest'
import {
  slugify, sectionByKind, updateSection, applyTitleOption, publishBlockers,
  SECTION_ORDER,
} from './storyEditorState'

const story = (overrides = {}) => ({
  id: 's1',
  status: 'review',
  title: 'A fall of soccer',
  slug: 'a-fall-of-soccer',
  dek: 'Half a credit of PE.',
  hero_asset_id: null,
  body: {
    sections: [
      { kind: 'what_they_did', body_md: 'Played a season.' },
      { kind: 'what_it_counted_for', body_md: '0.5 credit.' },
    ],
  },
  ...overrides,
})

describe('slugify', () => {
  it('matches the docs editor rule', () => {
    expect(slugify('How To Create a Quest!')).toBe('how-to-create-a-quest')
    expect(slugify('  two   spaces -- dashes ')).toBe('-two-spaces-dashes-')
    expect(slugify('')).toBe('')
    expect(slugify(null)).toBe('')
  })
})

describe('sectionByKind and updateSection', () => {
  it('reads a section by kind', () => {
    expect(sectionByKind(story(), 'what_they_did').body_md).toBe('Played a season.')
    expect(sectionByKind(story(), 'tasks')).toBeNull()
    expect(sectionByKind(null, 'tasks')).toBeNull()
  })

  it('patches a section without mutating the input', () => {
    const before = story()
    const after = updateSection(before, 'what_they_did', { body_md: 'Changed.' })
    expect(sectionByKind(after, 'what_they_did').body_md).toBe('Changed.')
    expect(sectionByKind(before, 'what_they_did').body_md).toBe('Played a season.')
    expect(after.body.sections).not.toBe(before.body.sections)
  })

  it('appends a missing section in canonical order', () => {
    const after = updateSection(story(), 'tasks', { rows: [{ title: 'T1' }] })
    const kinds = after.body.sections.map(s => s.kind)
    expect(kinds).toEqual(['what_they_did', 'tasks', 'what_it_counted_for'])
    expect(kinds.every(k => SECTION_ORDER.includes(k))).toBe(true)
  })

  it('creates the body when there is none', () => {
    const after = updateSection({ id: 'x' }, 'what_they_did', { body_md: 'Hi' })
    expect(after.body.sections).toEqual([{ kind: 'what_they_did', body_md: 'Hi' }])
  })
})

describe('applyTitleOption', () => {
  it('re-slugs an unpublished story', () => {
    const after = applyTitleOption(story(), 'Soccer, Counted')
    expect(after.title).toBe('Soccer, Counted')
    expect(after.slug).toBe('soccer-counted')
  })

  it('keeps the slug of a published story, because the slug is the URL', () => {
    const after = applyTitleOption(story({ status: 'published' }), 'New Title')
    expect(after.title).toBe('New Title')
    expect(after.slug).toBe('a-fall-of-soccer')
  })
})

describe('publishBlockers', () => {
  it('is empty for a complete story', () => {
    expect(publishBlockers(story(), [])).toEqual([])
  })

  it('flags an empty title, dek and what_they_did', () => {
    const s = updateSection(story({ title: ' ', dek: '' }), 'what_they_did', { body_md: '' })
    const codes = publishBlockers(s, []).map(b => b.code)
    expect(codes).toEqual(['empty_title', 'empty_dek', 'empty_what_they_did'])
  })

  it('flags a hero that points at an excluded or unknown asset', () => {
    const assets = [{ id: 'a1', included: false }, { id: 'a2', included: true }]
    expect(publishBlockers(story({ hero_asset_id: 'a1' }), assets).map(b => b.code))
      .toEqual(['hero_excluded'])
    expect(publishBlockers(story({ hero_asset_id: 'nope' }), assets).map(b => b.code))
      .toEqual(['hero_missing'])
    expect(publishBlockers(story({ hero_asset_id: 'a2' }), assets)).toEqual([])
  })

  it('carries the server shape so both lists render the same way', () => {
    const [b] = publishBlockers(story({ title: '' }), [])
    expect(b).toEqual({ code: 'empty_title', field: 'title', message: expect.any(String) })
  })
})
