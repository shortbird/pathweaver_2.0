/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * CSV and plain text, fetched and shown as-is.
 *
 * Deliberately NOT parsed into a table: an export from another school's system
 * has whatever shape it has, and a half-right table would hide columns a
 * reviewer needs. Monospaced and scrollable shows all of it, honestly.
 */
const TextPreview = ({ url }) => {
  const [state, setState] = useState({ status: 'loading', text: '' })

  useEffect(() => {
    let cancelled = false
    fetch(url)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => { if (!cancelled) setState({ status: 'ready', text }) })
      .catch(() => { if (!cancelled) setState({ status: 'error', text: '' }) })
    return () => { cancelled = true }
  }, [url])

  if (state.status === 'loading') {
    return <p className="text-sm text-gray-500 px-3 py-4">Loading…</p>
  }
  if (state.status === 'error') {
    return (
      <p className="text-sm text-gray-500 px-3 py-4">
        Couldn’t load this file here.{' '}
        <a href={url} target="_blank" rel="noreferrer"
           className="text-optio-purple hover:underline">Open it</a> instead.
      </p>
    )
  }
  return (
    <pre className="max-h-[70vh] overflow-auto text-xs text-gray-800 p-3 whitespace-pre font-mono">
      {state.text}
    </pre>
  )
}

export default TextPreview
