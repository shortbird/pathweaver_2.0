import React from 'react'
import StorySafetyReport from './StorySafetyReport'
import { hostnameOf, isStandaloneItem, sectionByKind, standaloneLockReason, updateSection } from './storyEditorState'

/**
 * Which evidence goes public, and what it says.
 *
 * Two lists. The media grid is every file the source had -- image, video,
 * PDF -- with the safety pass's verdict on each. An image the pass excluded
 * can only be brought back in the named tier, where a recorded consent
 * covers faces; in the anonymized tier the checkbox is locked and the reason
 * sits beside it, because there is no consent to lean on and the whole point
 * of that tier is that nobody has to be asked.
 *
 * A video shows as a player over its signed `media_url` (there is no poster
 * frame: the server has no ffmpeg). A PDF shows as a link to open it. Both
 * take the same include checkbox, alt and caption, but never the hero radio
 * -- the hero is the page's still and its og:image, and the server refuses
 * either there too. A video the pass excluded for location metadata stays
 * locked in both tiers: the file itself says where the child was, and it is
 * published byte for byte.
 *
 * "Words and links" is the second list: the student's quotations and the
 * external links they submitted. These are not assets -- nothing is copied
 * -- so they live on the story body's evidence items with their own
 * `included` flag, and edits go through `onStoryChange` the way the
 * criteria and rounds do. The text of a quotation is not editable: it is
 * the student's words verbatim or it is not a quotation. A social profile
 * is locked in both tiers; an external link is locked in the anonymized
 * tier (a URL to anything a student controls identifies them) and an
 * override in the named one. The server enforces the same rules.
 */
const isVideo = (asset) => asset?.kind === 'video'
const isDocument = (asset) => asset?.kind === 'document'
const noun = (asset) => (isVideo(asset) ? 'video' : isDocument(asset) ? 'document' : 'image')

const Thumb = ({ asset, included }) => {
  if (isVideo(asset)) {
    return (
      <div className={`shrink-0 w-full sm:w-64 rounded-md overflow-hidden bg-black border border-gray-200 ${included ? '' : 'opacity-60'}`}>
        {asset.media_url ? (
          <video
            controls
            preload="metadata"
            src={asset.media_url}
            className="w-full rounded-lg bg-black"
            aria-label={`Video ${asset.alt || asset.id}`}
          />
        ) : (
          <div className="w-full h-24 flex items-center justify-center text-xs text-gray-400">No preview</div>
        )}
      </div>
    )
  }
  if (isDocument(asset)) {
    const href = asset.media_url || asset.public_url
    return (
      <div className={`shrink-0 w-24 h-24 rounded-md bg-gray-50 border border-gray-200 flex flex-col items-center justify-center gap-1 text-xs ${included ? '' : 'opacity-60'}`}>
        <span className="font-medium text-gray-700">PDF</span>
        {href ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-optio-purple hover:underline">
            Open the PDF
          </a>
        ) : (
          <span className="text-gray-400">No preview</span>
        )}
      </div>
    )
  }
  return (
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
  )
}

const inputClass = 'w-full text-sm rounded-lg border border-gray-300 px-3 py-1.5 focus:ring-2 focus:ring-optio-purple/20 focus:border-optio-purple'

const MediaList = ({ assets, named, heroAssetId, onChange, onHeroChange }) => {
  const patch = (id, changes) => {
    onChange?.(assets.map(a => (a.id === id ? { ...a, ...changes } : a)))
  }

  if (assets.length === 0) {
    return <p className="text-sm text-gray-500">This story has no images, videos or documents.</p>
  }

  return (
    <ul className="space-y-3">
      {assets.map((asset) => {
        const excluded = asset.safety?.verdict === 'excluded'
        const located = asset.safety?.reason === 'video_location_metadata'
        const locked = excluded && (!named || located)
        const included = !!asset.included && !locked
        return (
          <li
            key={asset.id}
            className={`rounded-lg border p-3 flex gap-3 ${isVideo(asset) ? 'flex-col sm:flex-row' : ''} ${included ? 'border-gray-200 bg-white' : 'border-gray-200 bg-gray-50'}`}
          >
            <Thumb asset={asset} included={included} />

            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-4 flex-wrap">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={included}
                    disabled={locked}
                    onChange={e => patch(asset.id, { included: e.target.checked })}
                    className="rounded text-optio-purple focus:ring-optio-purple disabled:opacity-50"
                    aria-label={`Include ${noun(asset)} ${asset.alt || asset.id}`}
                  />
                  Include
                </label>
                {!isVideo(asset) && !isDocument(asset) && (
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
                )}
                {locked && (
                  <span className="text-xs text-gray-500">
                    {located
                      ? 'Locked: the video carries location metadata.'
                      : 'Locked out in the anonymized tier.'}
                  </span>
                )}
              </div>

              <StorySafetyReport safety={asset.safety} />

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={asset.alt || ''}
                  onChange={e => patch(asset.id, { alt: e.target.value })}
                  placeholder={isDocument(asset) ? 'Title' : 'Alt text'}
                  aria-label={`Alt text for ${noun(asset)} ${asset.id}`}
                  className={inputClass}
                />
                <input
                  type="text"
                  value={asset.caption || ''}
                  onChange={e => patch(asset.id, { caption: e.target.value })}
                  placeholder="Caption"
                  aria-label={`Caption for ${noun(asset)} ${asset.id}`}
                  className={inputClass}
                />
              </div>
            </div>
          </li>
        )
      })}
    </ul>
  )
}

const itemName = (item, ordinal) => (item.type === 'link' ? `link ${item.alt || hostnameOf(item.url) || ordinal}` : `quote ${ordinal}`)

const WordsAndLinks = ({ story, onStoryChange }) => {
  const section = sectionByKind(story, 'evidence')
  const all = section?.items || []
  const rows = all
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => isStandaloneItem(item))

  const patch = (index, changes) => {
    const next = all.map((item, i) => (i === index ? { ...item, ...changes } : item))
    onStoryChange?.(updateSection(story, 'evidence', { items: next }))
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-500">The student submitted no text or links.</p>
  }

  let quoteCount = 0
  let linkCount = 0
  return (
    <ul className="space-y-3">
      {rows.map(({ item, index }) => {
        const ordinal = item.type === 'link' ? ++linkCount : ++quoteCount
        const name = itemName(item, ordinal)
        const lockReason = standaloneLockReason(item, story?.tier)
        const locked = !!lockReason
        const included = item.included !== false && !locked
        return (
          <li key={index} className={`rounded-lg border border-gray-200 p-3 space-y-2 ${included ? 'bg-white' : 'bg-gray-50'}`}>
            <div className="flex items-center gap-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox"
                  checked={included}
                  disabled={locked}
                  onChange={e => patch(index, { included: e.target.checked })}
                  className="rounded text-optio-purple focus:ring-optio-purple disabled:opacity-50"
                  aria-label={`Include ${name}`}
                />
                Include
              </label>
              <span className="text-xs uppercase tracking-wider text-gray-400">
                {item.type === 'link' ? (hostnameOf(item.url) || 'link') : 'quote'}
              </span>
              {locked && <span className="text-xs text-gray-500">{lockReason}</span>}
            </div>

            {item.type === 'quote' ? (
              <blockquote className={`border-l-4 pl-3 text-sm whitespace-pre-wrap ${included ? 'border-optio-purple text-gray-700' : 'border-gray-200 text-gray-400'}`}>
                {item.text}
              </blockquote>
            ) : (
              <p className="text-sm min-w-0">
                <span className="font-medium text-gray-900">{item.alt || hostnameOf(item.url)}</span>
                {' '}
                <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-optio-purple hover:underline break-all">
                  {item.url}
                </a>
              </p>
            )}

            <StorySafetyReport safety={item.safety} />

            <input
              type="text"
              value={item.caption || ''}
              onChange={e => patch(index, { caption: e.target.value })}
              placeholder="Caption"
              aria-label={`Caption for ${name}`}
              className={inputClass}
            />
          </li>
        )
      })}
    </ul>
  )
}

const StoryEvidencePicker = ({ assets = [], tier, heroAssetId, onChange, onHeroChange, story, onStoryChange }) => {
  const named = tier === 'named'
  return (
    <div className="space-y-5">
      <MediaList assets={assets} named={named} heroAssetId={heroAssetId} onChange={onChange} onHeroChange={onHeroChange} />
      <div>
        <h4 className="text-sm font-medium text-gray-700 mb-2">Words and links</h4>
        <WordsAndLinks story={story} onStoryChange={onStoryChange} />
      </div>
    </div>
  )
}

export default StoryEvidencePicker
