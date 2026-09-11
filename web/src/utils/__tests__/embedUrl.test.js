import { describe, it, expect } from 'vitest'
import { getEmbedUrl, hostLabel } from '../embedUrl'

describe('getEmbedUrl', () => {
  it('turns a Google Doc editor link into its viewer', () => {
    expect(getEmbedUrl('https://docs.google.com/document/d/abc123/edit?usp=sharing'))
      .toBe('https://docs.google.com/document/d/abc123/preview')
    expect(getEmbedUrl('https://docs.google.com/presentation/d/xyz/edit#slide=id.p'))
      .toBe('https://docs.google.com/presentation/d/xyz/preview')
  })

  it('leaves a published-to-web Google link alone', () => {
    const url = 'https://docs.google.com/document/d/e/2PACX-1vT/pub'
    expect(getEmbedUrl(url)).toBe(url)
  })

  it('turns a Drive share link into its preview', () => {
    expect(getEmbedUrl('https://drive.google.com/file/d/FILEID/view?usp=sharing'))
      .toBe('https://drive.google.com/file/d/FILEID/preview')
    expect(getEmbedUrl('https://drive.google.com/open?id=FILEID'))
      .toBe('https://drive.google.com/file/d/FILEID/preview')
  })

  it('asks Canva for its embed view', () => {
    expect(getEmbedUrl('https://www.canva.com/design/DAF1/tok/view?utm_content=x'))
      .toBe('https://www.canva.com/design/DAF1/tok/view?embed')
  })

  it('wraps Figma and Scratch in their embed endpoints', () => {
    expect(getEmbedUrl('https://www.figma.com/file/AB/Thing'))
      .toBe('https://www.figma.com/embed?embed_host=optio&url=https%3A%2F%2Fwww.figma.com%2Ffile%2FAB%2FThing')
    expect(getEmbedUrl('https://scratch.mit.edu/projects/12345/'))
      .toBe('https://scratch.mit.edu/projects/12345/embed')
  })

  it('returns an unknown site as it came', () => {
    expect(getEmbedUrl('https://example.com/article?x=1')).toBe('https://example.com/article?x=1')
  })

  it('never frames a non-http scheme', () => {
    expect(getEmbedUrl('javascript:alert(1)')).toBeNull()
    expect(getEmbedUrl('data:text/html,hi')).toBeNull()
    expect(getEmbedUrl('')).toBeNull()
    expect(getEmbedUrl('not a url')).toBeNull()
  })
})

describe('hostLabel', () => {
  it('drops www and the path', () => {
    expect(hostLabel('https://www.example.com/a/b')).toBe('example.com')
    expect(hostLabel('nope')).toBe('link')
  })
})
