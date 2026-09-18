import React from 'react'

/**
 * Org selector shown only to superadmin (who has no org of their own and can
 * operate the SIS console across any organization). For org_admin/advisor it
 * renders nothing — they are locked to their own org.
 */
const SisOrgPicker = ({ isSuperadmin, orgs, orgId, setOrgId }) => {
  if (!isSuperadmin) return null
  return (
    // The label is sm-and-up: on a phone the header holds the menu button,
    // the wordmark, the search and the bell as well, and the word pushed the
    // bell off the edge. The select alone says what it is.
    <div className="flex items-center gap-2">
      <label className="hidden sm:inline text-sm text-neutral-500">Organization</label>
      <select
        value={orgId || ''}
        onChange={(e) => setOrgId(e.target.value)}
        aria-label="Organization"
        className="max-w-[8rem] sm:max-w-none rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
      >
        {orgs.length === 0 && <option value="">No organizations</option>}
        {orgs.map((o) => (
          <option key={o.id} value={o.id}>{o.name || o.slug || o.id}</option>
        ))}
      </select>
    </div>
  )
}

export default SisOrgPicker
