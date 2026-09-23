import React, { useState } from 'react'
import { toast } from 'react-hot-toast'
import { cardsFor } from '../../pages/school/schoolCards'
import { useDirectoryListing, useSaveDirectoryListing } from '../../hooks/api/useDirectoryListing'

/**
 * How this family is listed in the school's Family Directory: the listing
 * switch and which contact details it shows. The Directory tab of Family
 * Settings.
 *
 * These lived on the directory page itself until 2026-09-22. iCreate
 * (2d456409): "I really wanted the directory to be opt OUT instead of opt in.
 * And preferably put this in a more hidden place (Like settings.) Carpool
 * message can remain on top." Opt-out was already a per-school setting
 * (sis_settings.directory_default_in), so the default is untouched; what moved
 * is the control. The carpool checkbox stays on the directory page, where the
 * carpool filter is.
 *
 * Saves with the same endpoint the page used (hooks/api/useDirectoryListing),
 * and never sends carpool_interest: the backend writes only the keys it is
 * given, so leaving it out keeps whatever the family chose on the directory
 * page.
 */

/** The schools where this person is a guardian and the directory is on. */
export const directoryOrgs = (orgs) =>
  (orgs || []).filter((o) => o.is_guardian
    && cardsFor(o).some((c) => c.path === '/family-directory'))

const SHARES = [
  ['share_email', 'Parent emails'],
  ['share_phone', 'Family phone'],
  ['share_address', 'Street address'],
]

const DirectoryListingSettings = ({ orgs }) => {
  const [orgId, setOrgId] = useState(orgs[0]?.organization_id || null)
  const { data: status, isError: failed } = useDirectoryListing(orgId)
  const saveListing = useSaveDirectoryListing(orgId)

  // Optimistic, like the switch it replaces: the hook moves it on the click,
  // puts it back if the save fails, and this says why.
  const save = (next, message) => saveListing.mutate(next, {
    onSuccess: () => toast.success(message),
    onError: (e) => toast.error(e?.response?.data?.error || 'Could not update your directory setting'),
  })

  const org = orgs.find((o) => o.organization_id === orgId)
  const schoolName = org?.organization_name || 'the school'

  return (
    <div className="space-y-4">
      <p className="text-base text-gray-500">
        How your family appears in the {schoolName} Family Directory.
      </p>

      {orgs.length > 1 && (
        <select
          aria-label="School"
          value={orgId || ''}
          onChange={(e) => setOrgId(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-optio-purple"
        >
          {orgs.map((o) => <option key={o.organization_id} value={o.organization_id}>{o.organization_name}</option>)}
        </select>
      )}

      {failed && <p className="text-base text-gray-500">Could not load your directory setting.</p>}
      {!failed && !status && <p className="text-base text-gray-500">Loading…</p>}

      {status && (
        <div className="rounded-xl border border-gray-200 bg-white px-4 py-3.5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-base font-medium text-gray-900">
                {status.defaultIn ? 'Our family is listed in the directory' : 'Include our family in the directory'}
              </div>
              <div className="text-sm text-gray-500">
                Visible to families and staff at {schoolName}. Always shows your family name, parent
                names, and your kids&apos; first names. You choose the rest below.
                {status.defaultIn && ' Turn this off to be left out entirely.'}
              </div>
            </div>
            <button
              type="button" role="switch" aria-checked={status.optedIn}
              aria-label="Include our family in the directory"
              onClick={() => save({ ...status, optedIn: !status.optedIn },
                status.optedIn ? 'Your family was removed from the directory' : 'Your family is now in the directory')}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors ${status.optedIn ? 'bg-optio-purple' : 'bg-neutral-300'}`}
            >
              <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${status.optedIn ? 'translate-x-5' : 'translate-x-0.5'}`} />
            </button>
          </div>
          {status.optedIn && (
            <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-x-5 gap-y-2">
              {SHARES.map(([key, label]) => (
                <label key={key} className="inline-flex items-center gap-1.5 text-base text-gray-700 cursor-pointer">
                  <input
                    type="checkbox" checked={Boolean(status[key])}
                    onChange={() => save({ ...status, [key]: !status[key] }, 'Sharing preference saved')}
                    className="rounded border-gray-300 text-optio-purple focus:ring-optio-purple"
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DirectoryListingSettings
