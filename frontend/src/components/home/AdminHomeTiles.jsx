import React from 'react'
import { Link } from 'react-router-dom'

/**
 * Shared tiles for the admin role-homes (SchoolAdminHome, SuperadminHome).
 * Home-specific on purpose — nothing outside pages/home/ should import these.
 *
 * HomeStatSection / HomeStatTile: the "at a glance" numbers row. Each tile is
 * fed by its own query and degrades silently — while its source loads it shows
 * a skeleton, and if the source errored (value stays null/undefined) the tile
 * simply doesn't render. The section hides itself entirely when every source
 * failed, so an API outage leaves the greeting + doors, never an error wall.
 *
 * HomeDoorGrid: the door tiles into the role's surfaces (extracted from the
 * original stub pages so both homes keep the identical canonical-card look).
 */

/** Compact display for large counts: 1,284 / 12.9K. Strings pass through. */
export function formatStatValue(value) {
  if (typeof value === 'string') return value
  if (typeof value !== 'number' || Number.isNaN(value)) return null
  if (value >= 10000) {
    return new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 }).format(value)
  }
  return value.toLocaleString('en')
}

export function HomeStatTile({ to, label, value, isLoading }) {
  if (isLoading) {
    return (
      <div
        data-testid="home-stat-skeleton"
        className="bg-white rounded-xl border border-gray-200 shadow-sm p-4"
        aria-hidden="true"
      >
        <div className="animate-pulse space-y-2">
          <div className="h-7 w-14 bg-gray-100 rounded" />
          <div className="h-3 w-20 bg-gray-100 rounded" />
        </div>
      </div>
    )
  }

  const display = formatStatValue(value)
  if (display == null) return null // source failed or missing: degrade silently

  return (
    <Link
      to={to}
      className="block bg-white rounded-xl border border-gray-200 shadow-sm p-4 hover:border-optio-purple/60 hover:shadow-sm transition-all"
    >
      <span className="block text-2xl font-bold text-gray-900">{display}</span>
      <span className="block text-xs text-gray-500 mt-1">{label}</span>
    </Link>
  )
}

/**
 * stats: [{ key, to, label, value, isLoading }]
 * Renders nothing once every source has settled without a value.
 */
export function HomeStatSection({ stats, ariaLabel, className = '' }) {
  const anyVisible = stats.some(s => s.isLoading || formatStatValue(s.value) != null)
  if (!anyVisible) return null

  return (
    <section aria-label={ariaLabel} className={`grid gap-2.5 mt-6 ${className}`}>
      {stats.map(({ key, ...stat }) => (
        <HomeStatTile key={key} {...stat} />
      ))}
    </section>
  )
}

export function HomeDoorGrid({ doors, ariaLabel }) {
  return (
    <nav aria-label={ariaLabel} className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-6">
      {doors.map(({ name, path, description, Icon }) => (
        <Link
          key={path}
          to={path}
          className="group flex items-center gap-3 bg-white border border-gray-200 rounded-xl px-3.5 py-3 hover:border-optio-purple/60 hover:shadow-sm transition-all"
        >
          <span className="w-9 h-9 rounded-lg bg-optio-purple/10 flex items-center justify-center flex-shrink-0 group-hover:bg-gradient-primary transition-colors">
            <Icon className="w-5 h-5 text-optio-purple group-hover:text-white transition-colors" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-gray-900 group-hover:text-optio-purple truncate">{name}</span>
            <span className="block text-xs text-gray-500 truncate">{description}</span>
          </span>
        </Link>
      ))}
    </nav>
  )
}
