import React from 'react'

/**
 * Org selector shown only to superadmin (who has no org of their own and can
 * operate the SIS console across any organization). For org_admin/advisor it
 * renders nothing — they are locked to their own org.
 */
const SisOrgPicker = ({ isSuperadmin, orgs, orgId, setOrgId }) => {
  if (!isSuperadmin) return null
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm text-neutral-500">Organization</label>
      <select
        value={orgId || ''}
        onChange={(e) => setOrgId(e.target.value)}
        className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
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
