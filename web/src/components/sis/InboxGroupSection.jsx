import React, { useState } from 'react'
import { ChevronRightIcon } from '@heroicons/react/24/outline'

// How many of a section's groups show before "Show N more" (15d9eb42: "only
// the most recent 5 threads and then 'Show more'... Same with class chats").
export const SECTION_PREVIEW = 5

// The rows a section shows: the newest SECTION_PREVIEW (groups arrive newest
// first), every match while searching, and the open group even when it is
// older, so a group opened from a link or the bell is never hidden.
export function previewGroups(groups, { query, expanded, selectedId }) {
  const capped = !query && !expanded && groups.length > SECTION_PREVIEW
  if (!capped) return groups
  const visible = groups.slice(0, SECTION_PREVIEW)
  if (selectedId && !visible.some((g) => g.id === selectedId)) {
    const picked = groups.find((g) => g.id === selectedId)
    if (picked) visible.push(picked)
  }
  return visible
}

// One collapsible group section of the console inbox (Group threads, Class
// chats). A closed section still shows its unread count.
export default function InboxGroupSection({ label, groups, open, onToggle, query, selectedId, renderRow }) {
  const [expanded, setExpanded] = useState(false)
  if (!groups.length) return null
  const unread = groups.reduce((n, g) => n + (g.unread_count || 0), 0)
  const visible = previewGroups(groups, { query, expanded, selectedId })
  const hidden = groups.length - visible.length
  return (
    <div className="border-t border-gray-100">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-gray-50">
        <ChevronRightIcon className={`w-3.5 h-3.5 flex-shrink-0 text-neutral-400 transition-transform ${open ? 'rotate-90' : ''}`} />
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{label}</span>
        <span className="text-xs text-neutral-400">{groups.length}</span>
        {unread > 0 && (
          <span className="flex-shrink-0 rounded-full bg-optio-purple px-1.5 py-0.5 text-[11px] font-semibold text-white"
            aria-label={`${unread} unread in ${label}`}>
            {unread}
          </span>
        )}
      </button>
      {open && (
        <div className="pb-1">
          {visible.map(renderRow)}
          {!query && (hidden > 0 || expanded) && groups.length > SECTION_PREVIEW && (
            <button type="button" onClick={() => setExpanded((v) => !v)}
              className="w-full px-3 py-1.5 text-left text-xs font-medium text-optio-purple hover:bg-gray-50">
              {expanded ? 'Show fewer' : `Show ${hidden} more`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
