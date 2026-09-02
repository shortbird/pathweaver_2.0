import { describe, it, expect } from 'vitest'
import { isImageUrl, filenameFromUrl, itemLabel, blockItems } from './evidenceItems'

const STORAGE = 'https://auth.optioeducation.com/storage/v1/object/public/quest-evidence/evidence-tasks/4506b212'
const PHOTO = `${STORAGE}/117195ae-2ef4-4475-b235-7ab9161c251e_20260827_183541_IMG_20260827_123518.jpg`

describe('isImageUrl', () => {
  it('recognises an uploaded photo', () => {
    expect(isImageUrl(PHOTO)).toBe(true)
    expect(isImageUrl('https://x.test/a.PNG')).toBe(true)
    expect(isImageUrl('https://x.test/a.heic')).toBe(true)
  })

  it('ignores the query string a signed URL carries', () => {
    expect(isImageUrl(`${PHOTO}?token=abc.def&download=`)).toBe(true)
    expect(isImageUrl('https://x.test/doc.pdf?name=photo.jpg')).toBe(false)
  })

  it('says no to everything else', () => {
    expect(isImageUrl('https://docs.google.com/document/d/12s-XPOP/edit?tab=t.0')).toBe(false)
    expect(isImageUrl('https://x.test/pass_checker.txt')).toBe(false)
    expect(isImageUrl('https://x.test/no-extension')).toBe(false)
    expect(isImageUrl('')).toBe(false)
    expect(isImageUrl(null)).toBe(false)
  })
})

describe('filenameFromUrl', () => {
  it('strips the uuid and timestamp an upload is stored under', () => {
    expect(filenameFromUrl(PHOTO)).toBe('IMG_20260827_123518.jpg')
  })

  it('keeps a plain filename as it is', () => {
    expect(filenameFromUrl('https://x.test/notes.pdf')).toBe('notes.pdf')
  })

  it('decodes an escaped name', () => {
    expect(filenameFromUrl('https://x.test/my%20poem.jpg')).toBe('my poem.jpg')
  })
})

describe('itemLabel', () => {
  it('prefers what the student typed', () => {
    expect(itemLabel({ url: PHOTO, title: 'My poem' })).toBe('My poem')
    expect(itemLabel({ url: PHOTO, filename: 'poem.jpg' })).toBe('poem.jpg')
  })

  it('never returns a raw URL — that is the thing that broke the layout', () => {
    expect(itemLabel({ url: PHOTO, title: '' })).toBe('IMG_20260827_123518.jpg')
    expect(itemLabel({ url: PHOTO, title: '   ' })).toBe('IMG_20260827_123518.jpg')
  })

  it('falls back to a generic word when there is nothing to name', () => {
    expect(itemLabel({ url: 'https://example.com/' })).toBe('Open link')
    expect(itemLabel(null)).toBe('Open link')
  })
})

describe('blockItems', () => {
  it('reads the items array', () => {
    expect(blockItems({ items: [{ url: 'a' }, { url: 'b' }] })).toHaveLength(2)
  })

  it('wraps the legacy single-url shape', () => {
    expect(blockItems({ url: 'a' })).toEqual([{ url: 'a' }])
  })

  it('returns nothing for text content', () => {
    expect(blockItems({ text: 'hello' })).toEqual([])
    expect(blockItems('hello')).toEqual([])
    expect(blockItems(null)).toEqual([])
  })
})
