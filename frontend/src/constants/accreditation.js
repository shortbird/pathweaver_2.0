/**
 * WASC accreditation — single source of truth for display copy.
 *
 * Optio Academy (Optio's own full-time online private school) is accredited by
 * the Accrediting Commission for Schools, Western Association of Schools and
 * Colleges (ACS WASC). Unaccredited partner schools may issue transcripts under
 * Optio Academy's accreditation; whether a given transcript uses Optio's
 * accreditation is decided server-side (see backend/utils/accreditation.py) and
 * surfaced as `accreditation.source === 'optio'`.
 *
 * Compliance rules baked in here (ACS WASC "Accredited" Logo Use Guidelines):
 * - The logo artwork must NOT be altered (do not recolor/crop/distort the PNG).
 * - Any public accreditation claim must appear alongside the full commission
 *   name, address, and website (COMMISSION_* below).
 * - Grade note is not required (all grades operated were in the initial visit).
 * - Discontinue use if accreditation lapses -> flip ACCREDITATION_ACTIVE to false.
 */

// Master kill-switch. If WASC accreditation ever lapses, set this to false to
// pull the logo + phrase from every surface at once (guideline requirement).
export const ACCREDITATION_ACTIVE = true

// The accredited institution of record.
export const ACCREDITED_SCHOOL_NAME = 'Optio Academy'

// Unaltered artwork provided by ACS WASC. Served from the frontend public dir.
export const WASC_LOGO_SRC = '/images/wasc-accredited.png'
export const WASC_LOGO_ALT =
  'Accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges'

// Approved phrase (guidelines authorize the "Accredited by ..." wording verbatim).
export const WASC_ACCREDITED_PHRASE =
  'Accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges'

// Short public-facing claim for headings/badges. Must always be accompanied by
// the commission identity block below in the same communication.
export const WASC_SHORT_CLAIM = 'WASC-accredited'

// ACS WASC identity block — REQUIRED in the same communication as any claim.
export const COMMISSION_NAME =
  'Accrediting Commission for Schools, Western Association of Schools and Colleges'
export const COMMISSION_ADDRESS = '533 Airport Blvd., Suite 200, Burlingame, CA 94010'
export const COMMISSION_WEBSITE = 'www.acswasc.org'
export const COMMISSION_WEBSITE_URL = 'https://www.acswasc.org'

// Convenience: single-line disclosure used in footers.
export const WASC_DISCLOSURE_LINE = `${COMMISSION_NAME} · ${COMMISSION_ADDRESS} · ${COMMISSION_WEBSITE}`
