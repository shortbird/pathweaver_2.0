import React from 'react'

const VERDICT_STYLES = {
  safe: 'text-emerald-700',
  excluded: 'text-red-700',
  uncertain: 'text-amber-700',
}

const VERDICT_LABELS = {
  safe: 'Safe',
  excluded: 'Excluded',
  uncertain: 'Uncertain',
}

/**
 * One line per image: what the AI safety pass decided and why.
 *
 * The verdict is the server's decision rule applied to what the model
 * detected (faces, readable text, identifying detail), so the reason is the
 * thing to read. A superadmin can override an exclusion in the named tier
 * only; in the anonymized tier the picker disables the checkbox and this
 * line is the explanation next to it.
 */
const StorySafetyReport = ({ safety }) => {
  if (!safety) {
    return <p className="text-xs text-gray-400">Not checked.</p>
  }
  const verdict = safety.verdict || 'uncertain'
  const facts = []
  if (safety.faces != null) {
    facts.push(`${safety.faces} ${safety.faces === 1 ? 'face' : 'faces'}`)
  }
  if (Array.isArray(safety.readable_text) && safety.readable_text.length > 0) {
    facts.push(`text: ${safety.readable_text.join(', ')}`)
  }
  return (
    <p className="text-xs text-gray-600">
      <span className={`font-medium ${VERDICT_STYLES[verdict] || 'text-gray-700'}`}>
        {VERDICT_LABELS[verdict] || verdict}
      </span>
      {safety.reason && <span>{' '}· {safety.reason}</span>}
      {facts.length > 0 && <span className="text-gray-400">{' '}· {facts.join(' · ')}</span>}
    </p>
  )
}

export default StorySafetyReport
