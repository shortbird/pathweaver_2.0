import React from 'react'
import toast from 'react-hot-toast'
import { formatDateTime } from './crmConstants'

/**
 * A note save may answer with `doc_warning` when the attached doc could not
 * be read. The note is saved either way; this says why the text is missing.
 * Returns whether there was a warning.
 */
export const toastDocWarning = (response) => {
  const warning = response?.data?.doc_warning
  if (warning) toast.error(warning, { duration: 8000 })
  return Boolean(warning)
}

/**
 * The Google Doc attached to a CRM note: a link to the doc, and the copy of
 * its text taken when the note was saved, folded away under a toggle. `doc`
 * holds doc_url / doc_title / doc_text / doc_fetched_at, from a person note's
 * columns or a lead note's detail. `onRefresh` (person notes only) re-reads
 * the doc; `shareWith` is the address the doc must be shared with.
 */
const NoteDoc = ({ doc, onRefresh, refreshing = false, shareWith }) => {
  if (!doc?.doc_url) return null
  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <a
          href={doc.doc_url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm font-medium text-optio-purple hover:underline break-all"
        >
          {doc.doc_title || 'Google Doc'}
        </a>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="text-xs font-medium text-gray-600 hover:underline disabled:opacity-50"
          >
            {refreshing ? 'Refreshing...' : 'Refresh from doc'}
          </button>
        )}
        {doc.doc_fetched_at && (
          <span className="text-xs text-gray-400">Copied {formatDateTime(doc.doc_fetched_at)}</span>
        )}
      </div>
      {doc.doc_text ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-gray-600">
            Notes from the doc
          </summary>
          <p className="mt-2 max-h-96 overflow-y-auto text-sm text-gray-700 whitespace-pre-line">
            {doc.doc_text}
          </p>
        </details>
      ) : (
        <p className="mt-1 text-xs text-amber-700">
          {shareWith
            ? `Optio could not read this doc. Share it (or its folder) with ${shareWith}, then refresh.`
            : 'Optio could not read this doc yet. Only the link is saved.'}
        </p>
      )}
    </div>
  )
}

export default NoteDoc
