import React, { useId } from 'react'
import { motion } from 'framer-motion'

/**
 * The platform-standard tab bar / segmented filter — a glass pill rail whose
 * active highlight slides between tabs (docs/design/DESIGN_SYSTEM.md §7).
 * Extracted from SchoolPage's section bar (2026-08-10), which established the
 * recipe; this replaces the underline tabs, gray-track/white-pill switchers
 * and solid-fill chip toggles that grew up across the app.
 *
 * tabs: [{ id, label, badge? }] — hidden entirely below 2 tabs.
 * sticky: pins the rail just below the fixed navbar while the panel scrolls.
 */
export default function GlassTabBar({
  tabs,
  active,
  onSelect,
  sticky = false,
  size = 'sm',
  className = '',
  'aria-label': ariaLabel = 'Sections',
}) {
  const layoutId = useId()
  if (!tabs || tabs.length < 2) return null

  const tabSize = size === 'md'
    ? 'px-4 py-2 text-sm'
    : 'px-3.5 py-1.5 text-xs'

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`z-10 mx-auto flex w-fit max-w-full gap-1 overflow-x-auto rounded-full border border-white/60 bg-white/65 p-1.5 shadow-lg shadow-gray-900/10 backdrop-blur-xl ${sticky ? 'sticky' : ''} ${className}`}
      style={sticky ? { top: 'calc(var(--navbar-height, 64px) + 8px)' } : undefined}
    >
      {tabs.map(({ id, label, badge }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={active === id}
          onClick={() => onSelect(id)}
          className={`relative whitespace-nowrap rounded-full font-medium transition-colors ${tabSize} ${
            active === id ? 'text-optio-purple' : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          {active === id && (
            <motion.span
              layoutId={layoutId}
              transition={{ type: 'spring', bounce: 0.25, duration: 0.55 }}
              className="absolute inset-0 rounded-full border border-white/80 bg-gradient-to-b from-white to-white/70 shadow-md shadow-optio-purple/20"
              aria-hidden="true"
            />
          )}
          <span className="relative inline-flex items-center gap-1.5">
            {label}
            {badge != null && badge !== 0 && (
              <span className="rounded-full bg-optio-pink px-1.5 text-[10px] font-bold leading-4 text-white">
                {badge}
              </span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
