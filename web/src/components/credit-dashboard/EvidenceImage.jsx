/**
 * One picture of a student's evidence, for a reviewer -- shared by the credit
 * grader's evidence cards (EvidenceBlockCard) and, through them, the SIS
 * Submissions review.
 *
 * Two ways a picture goes wrong, both from ticket d0cc8d45 (Arete,
 * 2026-10-14: "maci's screenshot isn't showing, just the filename with the
 * generic thumbnail"):
 *
 *   - The URL only means something on the student's own computer. A student on
 *     a Chromebook pasted "file:///home/chronos/.../Screenshot ... .png" into
 *     the Link picker instead of uploading the picture. The browser will not
 *     load a file: URL from a web page at all, so the reviewer got a
 *     broken-image icon and clicking it went nowhere. Say what happened
 *     instead: the file never left the device. The rule is shared with every
 *     evidence entry point, which now refuses such a path before it is saved
 *     (utils/localFilePath).
 *   - The picture will not load (an expired signed URL on a page left open, a
 *     deleted object). Fall back to the file as a text link rather than a
 *     broken-image icon.
 */
import React, { useState } from 'react'
import { safeHref } from '../../utils/safeHref'
import { itemLabel } from '../../utils/evidenceItems'
import { isLocalFilePath, localFileName } from '../../utils/localFilePath'

export const isDeviceOnlyUrl = isLocalFilePath

export const DeviceOnlyFile = ({ item }) => (
  <p className="text-sm text-gray-600 break-all">
    <span className="font-medium text-gray-900">{localFileName(item)}</span>
    {' '}is saved only on the student&apos;s device. It was never uploaded, so there is
    nothing to show here.
  </p>
)

// break-all matters as much as the label does: a storage URL is one
// unbreakable 200-character word, and without it the pane grows to fit and
// carries the decision buttons off the right of the screen.
export const EvidenceFileLink = ({ item, prefix = '' }) => (
  isDeviceOnlyUrl(item.url)
    ? <DeviceOnlyFile item={item} />
    : (
      <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer"
         className="block text-sm text-optio-purple hover:underline break-all">
        {prefix}{itemLabel(item)}
      </a>
    )
)

export const EvidenceImage = ({ item }) => {
  const [failed, setFailed] = useState(false)
  if (isDeviceOnlyUrl(item.url)) return <DeviceOnlyFile item={item} />
  if (failed || !item.url) return <EvidenceFileLink item={item} prefix="Open file: " />
  return (
    <div>
      <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="block">
        <img
          src={item.url}
          alt={item.alt || itemLabel(item, 'Evidence')}
          loading="lazy"
          onError={() => setFailed(true)}
          className="max-w-full max-h-72 md:max-h-none object-contain rounded border"
        />
      </a>
      {item.caption && <p className="text-xs text-gray-500 mt-1">{item.caption}</p>}
    </div>
  )
}

export default EvidenceImage
