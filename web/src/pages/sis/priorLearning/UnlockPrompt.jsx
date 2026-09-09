/**
 * Extracted from sis/PriorLearningPage.jsx on 2026-09-04 (QF-02).
 * Moved verbatim -- no behaviour changed, only the address.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/**
 * Asks for a password for the files that are actually locked, naming them.
 *
 * Shown only when a run reported `locked_files`, so it appears at the moment it
 * would help and never as standing clutter.
 *
 * Asked once and only once: on success the backend stores the decrypted copy
 * over the locked one, so later runs — and the inline preview, which otherwise
 * prompts the reviewer every single time they open the document — just work.
 * The password itself is never stored anywhere; it is used to open the file and
 * then dropped, and the box is cleared on submit.
 */
const UnlockPrompt = ({ files, busy, onUnlock }) => {
  const [password, setPassword] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (!password.trim()) return
    onUnlock(password)
    setPassword('')
  }

  return (
    <form onSubmit={submit} className="px-3 py-2 border-t border-purple-200 bg-amber-50/60">
      <p className="text-sm text-amber-900">
        {files.length === 1 ? 'This file is password-protected and was not read:'
          : 'These files are password-protected and were not read:'}
      </p>
      <ul className="text-xs text-amber-900 list-disc pl-5 mb-2">
        {files.map((name) => <li key={name}>{name}</li>)}
      </ul>
      <div className="flex flex-wrap gap-2 items-center">
        <label className="sr-only" htmlFor={`pw-${files[0]}`}>PDF password</label>
        <input id={`pw-${files[0]}`} type="password" autoComplete="off"
               placeholder="PDF password" value={password}
               onChange={(e) => setPassword(e.target.value)}
               className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm" />
        <button type="submit" disabled={busy || !password.trim()}
                className="px-3 py-1.5 rounded-lg text-sm font-medium border border-amber-300 text-amber-900 disabled:opacity-50">
          {busy ? 'Reading…' : 'Unlock and re-read'}
        </button>
      </div>
      <p className="text-xs text-amber-800 mt-1">
        Asked once: the unlocked document is kept, so you won’t need this again.
        The password itself isn’t saved.
      </p>
    </form>
  )
}

export default UnlockPrompt
