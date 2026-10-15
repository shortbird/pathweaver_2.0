/**
 * isLocalFilePath — ticket d0cc8d45.
 *
 * A Chromebook student pasted a file:///home/chronos/... path into the
 * evidence Link picker; it saved as a link and the teacher saw nothing. Every
 * form of "a path on my own machine" must be caught, and no real web link.
 */

import {
  isLocalFilePath,
  localFileName,
  neverUploadedMessage,
} from '../localFilePath'

const CHROMEBOOK =
  'file:///home/chronos/u-3f2a9c/MyFiles/Downloads/Screenshot 2026-07-23 8.43.22 AM.png'

describe('isLocalFilePath (ticket d0cc8d45)', () => {
  it.each([
    CHROMEBOOK,
    'FILE:///C:/Users/maci/Desktop/essay.docx',
    'blob:https://app.optioeducation.com/1234-5678',
    'content://media/external/images/media/42',
    'C:\\Users\\maci\\Pictures\\art.jpg',
    'c:/Users/maci/Pictures/art.jpg',
    '\\\\school-server\\share\\project.pptx',
    '/home/maci/Downloads/a.png',
    '/Users/maci/Desktop/a.png',
    '/mnt/chromeos/MyFiles/Downloads/a.png',
    '~/Downloads/a.png',
    'home/chronos/u-3f2a9c/MyFiles/Downloads/a.png',
    '  file:///home/chronos/u-1/a.png  ',
  ])('treats %s as a local path', (value) => {
    expect(isLocalFilePath(value)).toBe(true)
  })

  it.each([
    'https://docs.google.com/document/d/abc/edit',
    'http://example.com/home/chronos/u-1/a.png',
    'https://www.youtube.com/watch?v=x',
    'mailto:teacher@school.org',
    'example.com/my-project',
    '/quests/123',
  ])('does not treat %s as a local path', (value) => {
    expect(isLocalFilePath(value)).toBe(false)
  })

  it.each(['', '   ', null, undefined, 42, {}])('is false for %p', (value) => {
    expect(isLocalFilePath(value)).toBe(false)
  })
})

describe('localFileName / neverUploadedMessage (ticket d0cc8d45)', () => {
  it('uses the last path segment when the title is the path itself', () => {
    expect(localFileName({ url: CHROMEBOOK, title: CHROMEBOOK })).toBe(
      'Screenshot 2026-07-23 8.43.22 AM.png',
    )
  })

  it('uses a real title when there is one', () => {
    expect(localFileName({ url: CHROMEBOOK, title: 'My poster' })).toBe('My poster')
  })

  it('reads a Windows path and a percent-encoded name', () => {
    expect(localFileName({ url: 'C:\\Users\\m\\art.jpg' })).toBe('art.jpg')
    expect(localFileName({ url: 'file:///home/m/My%20poster.png' })).toBe('My poster.png')
  })

  it('builds the warning', () => {
    expect(neverUploadedMessage({ url: CHROMEBOOK })).toBe(
      'Screenshot 2026-07-23 8.43.22 AM.png never uploaded. Add it again with Upload.',
    )
  })
})
