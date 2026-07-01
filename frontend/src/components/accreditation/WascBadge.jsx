import React from 'react'
import {
  ACCREDITATION_ACTIVE,
  WASC_LOGO_SRC,
  WASC_LOGO_ALT,
  WASC_ACCREDITED_PHRASE,
  COMMISSION_NAME,
  COMMISSION_ADDRESS,
  COMMISSION_WEBSITE,
  COMMISSION_WEBSITE_URL,
} from '../../constants/accreditation'

/**
 * Reusable ACS WASC accreditation mark.
 *
 * Renders the unaltered WASC logo plus the required commission identity block
 * (name, address, website) so every placement satisfies the guideline that a
 * claim must appear alongside that information.
 *
 * Variants:
 * - "card"        Boxed callout for marketing sections (logo + phrase + block).
 * - "inline"      Compact logo + short disclosure, for footers.
 * - "transcript"  Print-friendly, serif-neutral block for official transcripts.
 *
 * Renders nothing when accreditation is inactive (kill-switch honored).
 */
const IdentityBlock = ({ className = '', showPhrase = true }) => (
  <div className={className}>
    {showPhrase && <p className="font-medium">{WASC_ACCREDITED_PHRASE}</p>}
    <p>{COMMISSION_NAME}</p>
    <p>
      {COMMISSION_ADDRESS} ·{' '}
      <a href={COMMISSION_WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="underline">
        {COMMISSION_WEBSITE}
      </a>
    </p>
  </div>
)

const WascBadge = ({ variant = 'card', className = '' }) => {
  if (!ACCREDITATION_ACTIVE) return null

  if (variant === 'inline') {
    return (
      <div className={`flex flex-col items-center sm:items-start gap-2 ${className}`}>
        <img src={WASC_LOGO_SRC} alt={WASC_LOGO_ALT} className="h-10 w-auto bg-white rounded p-1" />
        <p className="text-gray-500 text-xs leading-relaxed text-center sm:text-left">
          {COMMISSION_NAME}
          <br />
          {COMMISSION_ADDRESS} ·{' '}
          <a href={COMMISSION_WEBSITE_URL} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">
            {COMMISSION_WEBSITE}
          </a>
        </p>
      </div>
    )
  }

  if (variant === 'transcript') {
    // Neutral styling so it prints cleanly alongside the serif transcript.
    return (
      <div className={`flex flex-col items-center gap-2 ${className}`}>
        <img src={WASC_LOGO_SRC} alt={WASC_LOGO_ALT} className="h-10 w-auto" />
        <IdentityBlock className="text-[9px] sm:text-[10px] text-gray-600 text-center leading-snug" showPhrase={false} />
      </div>
    )
  }

  // Default: "card"
  return (
    <div
      className={`flex flex-col items-center gap-4 rounded-2xl border border-gray-200 bg-white p-6 shadow-sm ${className}`}
    >
      <img src={WASC_LOGO_SRC} alt={WASC_LOGO_ALT} className="h-14 w-auto" />
      <IdentityBlock
        className="text-center text-sm text-gray-600 leading-relaxed"
        showPhrase={false}
      />
    </div>
  )
}

export default WascBadge
