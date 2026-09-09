/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import {
  ACCEPT_ATTR, MAX_FILES, isSupported, kindFor, prettySize,
} from '../../../utils/priorLearningFiles'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import EvidenceItem from './EvidenceItem'

const EvidenceList = ({ evidence, busy, onAdd, onDelete }) => {
  const fileInput = useRef(null)
  return (
    <div className="space-y-2">
      {evidence?.length
        ? evidence.map((item) => (
          <EvidenceItem key={item.id} item={item} busy={busy}
                        onDelete={onDelete && (() => onDelete(item.id))} />
        ))
        : <p className="text-sm text-gray-500">No evidence attached.</p>}

      {onAdd && (
        <div>
          <input ref={fileInput} type="file" multiple accept={ACCEPT_ATTR} className="sr-only"
                 aria-label="Add a document to this record"
                 onChange={(e) => {
                   onAdd(e.target.files)
                   // Cleared so the same file can be picked twice — a reviewer
                   // re-adding a document they just deleted otherwise gets a
                   // change event that never fires.
                   e.target.value = ''
                 }} />
          <button type="button" disabled={busy} onClick={() => fileInput.current?.click()}
                  className="text-xs text-optio-purple font-medium disabled:opacity-50">
            + Add a document
          </button>
        </div>
      )}
    </div>
  )
}

export default EvidenceList
