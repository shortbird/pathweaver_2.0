import React from 'react'
import { BuildingLibraryIcon } from '@heroicons/react/24/outline'

/**
 * The school's own mark, centered like a letterhead — the header of every
 * school tab (pages/school/SchoolShell) and of the superadmin's preview of
 * the school page. The logo comes from the org's branding
 * (branding_config.logo_url via /api/sis/school/context); a school without
 * one gets a neutral tile, never a broken image.
 *
 * Lived inline in SchoolPage until 2026-09-16, when the family pages became
 * tabs of one school page and the header moved up to the shell above them.
 */
export default function SchoolLetterhead({ name, logoUrl, logoSubtitle, className = '' }) {
  return (
    <header className={`flex flex-col items-center text-center ${className}`}>
      {logoUrl ? (
        <>
          {/* The logo IS the title here — the name rides along for screen
              readers and the page's accessible heading, not on screen. */}
          <img src={logoUrl} alt={name || 'School logo'} className="h-[120px] max-w-full object-contain" />
          {/* Optional sub-brand word under the mark (branding_config.
              logo_subtitle) — e.g. the Optio wordmark with "academy" below. */}
          {logoSubtitle && (
            <p aria-hidden="true" className="mt-1 text-lg font-semibold uppercase tracking-[0.45em] text-optio-purple">
              {logoSubtitle}
            </p>
          )}
          <h1 className="sr-only">{name || 'My school'}</h1>
        </>
      ) : (
        <>
          <div
            aria-hidden="true"
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-optio-purple to-optio-pink flex items-center justify-center"
          >
            <BuildingLibraryIcon className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mt-3">{name || 'My school'}</h1>
        </>
      )}
    </header>
  )
}
