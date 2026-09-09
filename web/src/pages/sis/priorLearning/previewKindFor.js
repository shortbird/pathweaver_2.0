/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

/**
 * Which inline viewer a file gets. Decided from the stored content_type first
 * and the file name second — a file uploaded from a phone often arrives with a
 * generic octet-stream type, and the extension is then the only honest signal.
 */
export const previewKindFor = (item) => {
  const type = (item.content_type || '').toLowerCase()
  // The stored file name first, then the URL — both really carry an extension.
  // `title` is deliberately not consulted: it's a human label ("Transcript"),
  // and letting it win means a real PDF falls through to the download fallback
  // just because the parent gave it a name without a dot in it.
  const ext = [item.file_name, item.url]
    .map((candidate) => {
      const name = (candidate || '').toLowerCase().split('?')[0].split('#')[0]
      return name.includes('.') ? name.split('.').pop() : ''
    })
    .find(Boolean) || ''
  if (type.startsWith('image/') || item.evidence_type === 'image'
      || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif', 'jfif', 'tiff', 'tif'].includes(ext)) {
    return 'image'
  }
  if (type === 'application/pdf' || ext === 'pdf') return 'pdf'
  if (type.startsWith('text/') || ['csv', 'txt'].includes(ext)) return 'text'
  // doc/docx and anything else: no browser can render it in place, and pretending
  // otherwise gives the reviewer an empty grey box instead of a working link.
  return 'download'
}

export default previewKindFor
