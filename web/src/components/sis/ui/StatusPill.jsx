import { statusMeta } from './statusMaps'

/**
 * The one status pill for every SIS queue.
 *
 * `domain` names a vocabulary in statusMaps.js and `status` a word in it; the
 * pill shows that word's label in that word's colour, so the same status looks
 * the same on every page. `fallback` is the status to show when `status` is
 * empty (a checklist item with no status is pending); with neither, nothing
 * renders. `children` overrides the label for the rare pill whose text is not
 * the status ("Roll not taken").
 */
const StatusPill = ({ domain, status, fallback = null, className = '', children = null }) => {
  const key = status || fallback
  if (!key && children == null) return null
  const meta = statusMeta(domain, key)
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${meta.tone} ${className}`}>
      {children ?? meta.label}
    </span>
  )
}

export default StatusPill
