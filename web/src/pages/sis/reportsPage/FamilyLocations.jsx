import React, { useState } from 'react'

/**
 * Where families live -- families counted by city, each city opening to its
 * families, with who said they would carpool.
 *
 * iCreate (Katrine Myers), ticket 1a54e05a: "Is there a way I could see some
 * kind of aggregate list for where the families live? I have some families
 * asking whether others might be interested in carpooling and although that
 * option is available to post, it would be convenient to know so I could help
 * it along."
 *
 * Not a flat table: the question is "who else lives near this family", so the
 * shape is town first, then the families in it.
 */
const carpoolBadge = (v) => {
  if (v === true) {
    return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-800">Wants to carpool</span>
  }
  if (v === false) return <span className="text-xs text-neutral-400">No carpool</span>
  return <span className="text-xs text-neutral-400">Carpool not answered</span>
}

export default function FamilyLocations({ report }) {
  const [carpoolOnly, setCarpoolOnly] = useState(false)
  const cities = (report?.cities || [])
    .map((c) => (carpoolOnly
      ? { ...c, families: c.families.filter((f) => f.carpool_interest === true) }
      : c))
    .filter((c) => c.families.length)

  if (!report?.cities?.length) return <p className="text-neutral-500">No families on file yet.</p>

  return (
    <div className="space-y-3">
      <label className="no-print flex items-center gap-1.5 text-sm text-neutral-600">
        <input type="checkbox" className="accent-optio-purple" aria-label="Only families who want to carpool"
          checked={carpoolOnly} onChange={(e) => setCarpoolOnly(e.target.checked)} />
        Only families who want to carpool
      </label>
      {cities.length === 0 && <p className="text-neutral-500">No family has said they want to carpool yet.</p>}
      <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
        {cities.map((c) => (
          <li key={c.city}>
            <details className="group">
              <summary className="cursor-pointer px-3 py-2 flex items-baseline justify-between gap-3 flex-wrap">
                <span className={`font-medium ${c.no_city ? 'text-neutral-500 italic' : 'text-neutral-900'}`}>
                  {c.city}{c.states?.length ? <span className="text-neutral-400 font-normal">, {c.states.join(' / ')}</span> : null}
                </span>
                <span className="text-sm text-neutral-600">
                  {c.families.length} famil{c.families.length === 1 ? 'y' : 'ies'}
                  {c.carpool_count > 0 && (
                    <span className="ml-2 text-green-700">· {c.carpool_count} want to carpool</span>
                  )}
                </span>
              </summary>
              <ul className="px-3 pb-3 space-y-2">
                {c.families.map((f) => (
                  <li key={f.household_id} className="flex items-start justify-between gap-3 flex-wrap text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-neutral-900">
                        {f.name}
                        {f.postal_code && <span className="ml-2 text-xs font-normal text-neutral-400">{f.postal_code}</span>}
                      </div>
                      <div className="text-xs text-neutral-500">
                        {[f.guardians?.join(', '), f.students?.length ? `Students: ${f.students.join(', ')}` : '']
                          .filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    {carpoolBadge(f.carpool_interest)}
                  </li>
                ))}
              </ul>
            </details>
          </li>
        ))}
      </ul>
    </div>
  )
}

export const familyLocationsSummary = (report) => {
  const total = report?.total_families || 0
  const carpool = report?.carpool_families || 0
  const cities = (report?.cities || []).filter((c) => !c.no_city).length
  const none = report?.no_city_families || 0
  return `${total} famil${total === 1 ? 'y' : 'ies'} in ${cities} cit${cities === 1 ? 'y' : 'ies'}`
    + ` · ${carpool} want to carpool`
    + (none ? ` · ${none} with no city on file` : '')
}
