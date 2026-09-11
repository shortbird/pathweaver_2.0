import React from 'react'
import StorySafetyReport from './StorySafetyReport'

/**
 * Which images go public, and what they say.
 *
 * Every candidate the source had is listed with the safety pass's verdict.
 * An image the pass excluded can only be brought back in the named tier,
 * where a recorded consent covers faces; in the anonymized tier the checkbox
 * is locked and the reason sits beside it, because there is no consent to
 * lean on and the whole point of that tier is that nobody has to be asked.
 */
const StoryEvidencePicker = ({ assets = [], tier, heroAssetId, onChange, onHeroChange }) => {
  const named = tier === 'named'

  const patch = (id, changes) => {
    onChange?.(assets.map(a => (a.id === id ? { ...a, ...changes } : a)))
  }

  if (assets.length === 0) {
    return <p className="text-sm text-gray-500">This story has no images.</p>
  }

  return (
    <ul className="space-y-3">
      {assets.map((asset) => {
        const excluded = asset.safety?.verdict === 'excluded'
        const locked = excluded && !named
        const included = !!asset.included && !locked
        return (
          <li
            key={asset.id}
            className={`rounded-lg border p-3 flex gap-3 ${included ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'}`}
          >
            <div className="shrink-0 w-24 h-24 rounded-md overflow-hidden bg-gray-100 border border-gray-200">
              {asset.thumb_url ? (
                <img
                  src={asset.thumb_url}
                  alt={asset.alt || ''}
                  className={`w-full h-full object-cover ${included ? '' : 'opacity-50'}`}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-xs text-gray-400">No preview</div>
              )}
            </div>

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={included}
                    disabled={locked}
                    onChange={e => patch(asset.id, { included: e.target.checked })}
                    className="rounded text-optio-purple focus:ring-optio-purple disabled:opacity-50"
                    aria-label={`Include image ${asset.alt || asset.id}`}
                  />
                  Include
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="radio"
                    name="story-hero"
                    checked={heroAssetId === asset.id}
                    disabled={!included}
                    onChange={() => onHeroChange?.(asset.id)}
                    className="text-optio-purple focus:ring-optio-purple disabled:opacity-50"
                    aria-label={`Use as hero image ${asset.alt || asset.id}`}
                  />
                  Hero
                </label>
                {locked && (
                  <span className="text-xs text-gray-500">
                    Locked out in the anonymized tier.
                  </span>
                )}
              </div>

              <StorySafetyReport safety={asset.safety} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={asset.alt || ''}
                  onChange={e => patch(asset.id, { alt: e.target.value })}
                  placeholder="Alt text"
                  aria-label={`Alt text for image ${asset.id}`}
                  className="w-full text-sm rounded-lg border border-gray-300 px-3 py-1.5 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple"
                />
                <input
                  type="text"
                  value={asset.caption || ''}
                  onChange={e => patch(asset.id, { caption: e.target.value })}
                  placeholder="Caption"
                  aria-label={`Caption for image ${asset.id}`}
                  className="w-full text-sm rounded-lg border border-gray-300 px-3 py-1.5 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple"
                />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export default StoryEvidencePicker
