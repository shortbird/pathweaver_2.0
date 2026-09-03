/**
 * WASC accreditation constants, ported verbatim from
 * frontend/src/constants/accreditation.js. Compliance rules baked in
 * (ACS WASC "Accredited" Logo Use Guidelines):
 * - The logo artwork must NOT be altered (do not recolor/crop/distort the PNG).
 * - Any public accreditation claim must appear alongside the full commission
 *   name, address, and website.
 * - If accreditation lapses, flip ACCREDITATION_ACTIVE to false to pull the
 *   logo and phrase from every surface at once.
 */
export const ACCREDITATION_ACTIVE = true

export const ACCREDITED_SCHOOL_NAME = 'Optio Academy'

export const WASC_LOGO_SRC = '/images/wasc-accredited.png'
export const WASC_LOGO_ALT =
  'Accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges'

export const WASC_ACCREDITED_PHRASE =
  'Accredited by the Accrediting Commission for Schools, Western Association of Schools and Colleges'

export const COMMISSION_NAME =
  'Accrediting Commission for Schools, Western Association of Schools and Colleges'
export const COMMISSION_ADDRESS = '533 Airport Blvd., Suite 200, Burlingame, CA 94010'
export const COMMISSION_WEBSITE = 'www.acswasc.org'
export const COMMISSION_WEBSITE_URL = 'https://www.acswasc.org'
