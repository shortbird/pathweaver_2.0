/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import { useConfirm } from '../../../contexts/ConfirmContext'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import previewKindFor from './previewKindFor'
import TextPreview from './TextPreview'

/**
 * One piece of evidence, shown in place.
 *
 * A reviewer deciding whether four years of piano is worth 1.0 fine arts should
 * not be opening tabs to find out — the document is the decision. So each file
 * renders inline: images as images, PDFs in the browser's own viewer (which
 * scrolls through every page inside the frame), CSV and text fetched and shown
 * in a scrolling block. Everything gets a fixed-height, scrollable window rather
 * than a page-length expansion, so a queue of twenty records stays navigable.
 *
 * Previews are lazy — a browser only fetches the ones scrolled into view.
 */
const EvidenceItem = ({ item, busy, onDelete }) => {
  const confirm = useConfirm()
  const [open, setOpen] = useState(true)
  const kind = previewKindFor(item)
  const label = item.title || item.file_name || item.url

  // Deleting a family's document is not undoable and the file goes with it, so
  // it asks first and names what it is about to remove.
  const confirmDelete = async () => {
    if (await confirm(`Delete "${label}"? This removes the file for good.`)) onDelete()
  }

  const DeleteButton = () => (
    onDelete ? (
      <button type="button" disabled={busy} onClick={confirmDelete}
              className="text-xs text-gray-500 hover:text-red-600 disabled:opacity-50">
        Delete
      </button>
    ) : null
  )

  // Typed evidence has no file; it IS the text.
  if (!item.url) {
    return (
      <div className="flex items-start justify-between gap-3 text-sm bg-gray-50 rounded-lg px-3 py-2">
        <p className="min-w-0">
          <span className="text-gray-500 capitalize mr-2">{item.evidence_type}</span>
          <span className="text-gray-700 whitespace-pre-wrap">{item.content}</span>
        </p>
        <div className="shrink-0"><DeleteButton /></div>
      </div>
    )
  }

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between gap-3 bg-gray-50 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
          {/* The parent's own note about this file — often the only thing that
              says which year a scanned report card belongs to. */}
          {item.content && <p className="text-xs text-gray-500 truncate">{item.content}</p>}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button type="button" onClick={() => setOpen(!open)}
                  className="text-xs text-optio-purple font-medium">
            {open ? 'Collapse' : 'Expand'}
          </button>
          <a href={item.url} target="_blank" rel="noreferrer"
             className="text-xs text-gray-500 hover:text-optio-purple">
            Open
          </a>
          <DeleteButton />
        </div>
      </div>

      {open && (
        <div className="bg-white">
          {kind === 'image' && (
            <div className="max-h-[70vh] overflow-auto">
              <img src={item.url} alt={label} loading="lazy" className="w-full h-auto" />
            </div>
          )}
          {kind === 'pdf' && (
            // The browser's PDF viewer paginates and scrolls inside the frame,
            // which is what makes a 12-page transcript readable without a tab.
            <iframe src={item.url} title={label} loading="lazy"
                    className="w-full h-[70vh] border-0" />
          )}
          {kind === 'text' && <TextPreview url={item.url} />}
          {kind === 'download' && (
            <p className="text-sm text-gray-500 px-3 py-4">
              This file type can’t be shown here.{' '}
              <a href={item.url} target="_blank" rel="noreferrer"
                 className="text-optio-purple hover:underline">Open it</a> to read it.
            </p>
          )}
        </div>
      )}
    </div>
  )
}

export default EvidenceItem
