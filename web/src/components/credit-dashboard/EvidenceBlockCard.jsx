/**
 * Rendering one block of a student's evidence for a reviewer.
 *
 * Split out of the detail pane when it crossed the size cap, and now the
 * grader's evidence column leans on it. It is a clean seam: this file knows how
 * to show a photo, a document, a link and a video, and nothing about approving
 * anything.
 *
 * The recurring hazard here is that `block_type` records which picker the
 * student opened, not what the file is. A .jpg pasted into the Link picker
 * arrives as a `link` block, so every branch judges by the URL (isImageUrl,
 * isUploadedVideoUrl) rather than by the declared type -- see
 * web/src/utils/evidenceItems.js for the day that mattered.
 */
import React, { useState } from 'react'
import { safeHref } from '../../utils/safeHref'
import { isImageUrl, itemLabel } from '../../utils/evidenceItems'
import {
  getVideoEmbedUrl,
  getVideoAspectClass,
  isVideoSharingLink,
  isUploadedVideoUrl,
} from '../../utils/videoUtils'
import DocumentPreview, { isPreviewableDocument, isPdf, isDocx } from '../evidence/preview/DocumentPreview'
import VideoLinkPreview from '../evidence/preview/VideoLinkPreview'
import LinkEmbed from '../evidence/preview/LinkEmbed'
import { DIFF_NEW, DIFF_MODIFIED, DIFF_REMOVED } from './evidenceDiff'

// Evidence block content can be a string or an object like {text: "..."}
const getBlockText = (content) => {
  if (typeof content === 'string') return content
  if (content && typeof content === 'object') return content.text || content.url || JSON.stringify(content)
  return String(content ?? '')
}

// Normalize items from evidence blocks (handles both single-item and multi-item
// formats). Deliberately takes no type: the caller's idea of what kind of block
// this is has never affected the answer, and the block's own declared type is
// not to be trusted anyway (see the module note).
const getBlockItems = (content) => {
  if (!content || typeof content !== 'object') return []
  if (Array.isArray(content.items)) return content.items
  // Legacy single-item format
  if (content.url) return [content]
  return []
}

// Play the video in the pane rather than sending the reviewer to a new tab.
// Three kinds arrive here: a file the student uploaded (Supabase storage, served
// as a signed URL), a link to a service that allows embedding (YouTube, Vimeo,
// Drive, Loom), and a share link that refuses to embed (Google Photos, iCloud) —
// only the last still has to be opened elsewhere.
const renderVideoItem = (item) => {
  if (!item?.url) return null

  if (isUploadedVideoUrl(item.url)) {
    return (
      <video
        src={item.url}
        controls
        preload="metadata"
        className="w-full max-h-[480px] rounded border bg-black"
      />
    )
  }

  if (isVideoSharingLink(item.url)) {
    return <VideoLinkPreview url={item.url} title={item.title} />
  }

  const embedUrl = getVideoEmbedUrl(item.url)
  if (embedUrl) {
    return (
      <div className={`${getVideoAspectClass(item.url)} bg-black rounded border overflow-hidden`}>
        <iframe
          src={embedUrl}
          className="w-full h-full border-0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          title={item.title || 'Video evidence'}
        />
      </div>
    )
  }

  return (
    <a
      href={safeHref(item.url)}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sm text-optio-purple hover:underline flex items-center gap-1 break-all"
    >
      <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
      </svg>
      {itemLabel(item, 'Watch video')}
    </a>
  )
}

// Renders just the inner content of a block (text, image, link, etc).
// Used for both the live block and the "previous version" peek for modified
// blocks. Stays a plain function so callers can drop it inside any wrapper.
const renderBlockBody = (block) => {
  if (!block) return null
  switch (block.block_type) {
    case 'text':
      return (
        <p className="text-sm text-gray-700 whitespace-pre-wrap">{getBlockText(block.content)}</p>
      )
    case 'image':
      return (
        <div className="space-y-2">
          {getBlockItems(block.content).map((item, j) => (
            <div key={j}>
              <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="block">
                <img
                  src={item.url}
                  alt={item.alt || 'Evidence'}
                  className="max-w-full max-h-72 md:max-h-none object-contain rounded border"
                  loading="lazy"
                />
              </a>
              {item.caption && (
                <p className="text-xs text-gray-500 mt-1">{item.caption}</p>
              )}
            </div>
          ))}
        </div>
      )
    case 'link':
      return (
        <div className="space-y-2">
          {/* A photo pasted into the Link picker is still a photo. Trusting
              block_type here showed reviewers a 200-character storage URL where
              the evidence belonged (Gryffin, 2026-09-02). */}
          {getBlockItems(block.content).map((item, j) => (
            isImageUrl(item.url) ? (
              <div key={j}>
                <a href={safeHref(item.url)} target="_blank" rel="noopener noreferrer" className="block">
                  <img
                    src={item.url}
                    alt={item.alt || itemLabel(item, 'Evidence')}
                    className="max-w-full max-h-72 md:max-h-none object-contain rounded border"
                    loading="lazy"
                  />
                </a>
                {item.caption && <p className="text-xs text-gray-500 mt-1">{item.caption}</p>}
              </div>
            ) : getVideoEmbedUrl(item.url) || isVideoSharingLink(item.url) ? (
              <div key={j}>
                {renderVideoItem(item)}
                {item.title && <p className="text-xs text-gray-500 mt-1">{item.title}</p>}
              </div>
            ) : isPdf(item.url, item.title) || isDocx(item.url, item.title) ? (
              // A PDF or Word file pasted as a link is still a document.
              <div key={j}>
                <DocumentPreview url={item.url} title={itemLabel(item, 'Document')} variant="inline" />
                {isPreviewableDocument(item.url, item.title) && (
                  <p className="text-xs text-gray-500 mt-1">{itemLabel(item, 'Document')}</p>
                )}
              </div>
            ) : (
              // Anything else is a page: show it here rather than sending the
              // reviewer off to a new tab. The frame carries its own Open link.
              <LinkEmbed key={j} url={item.url} title={item.title} />
            )
          ))}
        </div>
      )
    case 'video':
      return (
        <div className="space-y-3">
          {getBlockItems(block.content).map((item, j) => (
            <div key={j}>
              {renderVideoItem(item)}
              {item.title && <p className="text-xs text-gray-500 mt-1">{item.title}</p>}
            </div>
          ))}
        </div>
      )
    case 'file':
    case 'document':
      return (
        <div className="space-y-3">
          {getBlockItems(block.content).map((item, j) => (
            <div key={j}>
              {/* PDFs page through in place and images render as images; only a
                  format nothing can display (docx, xlsx) falls back to a
                  download link -- which names the file itself, so captioning it
                  here would say the same thing twice. */}
              <DocumentPreview
                url={item.url}
                title={itemLabel(item, 'Document')}
                variant="inline"
              />
              {isPreviewableDocument(item.url, itemLabel(item, 'Document')) && (
                <p className="text-xs text-gray-500 mt-1">{itemLabel(item, 'Document')}</p>
              )}
            </div>
          ))}
        </div>
      )
    default:
      return null
  }
}

const DIFF_BORDER = {
  [DIFF_NEW]: 'border-emerald-300 bg-emerald-50/40',
  [DIFF_MODIFIED]: 'border-sky-300 bg-sky-50/40',
  [DIFF_REMOVED]: 'border-gray-300 bg-gray-50 opacity-75',
}

const EvidenceBlockCard = ({ block, diffType, previousBlock, anchorId, highlighted }) => {
  const [showPrev, setShowPrev] = useState(false)
  const borderClass = DIFF_BORDER[diffType] || 'border-gray-200'
  // tabIndex so the card can take focus when a citation jumps to it: a reviewer
  // on a keyboard lands ON the evidence rather than merely scrolling past it.
  return (
    <div
      id={anchorId}
      tabIndex={anchorId ? -1 : undefined}
      className={`border-2 rounded-lg p-3 transition-shadow duration-500 ${borderClass} ${
        highlighted ? 'ring-2 ring-optio-purple ring-offset-2' : ''
      }`}
    >
      {diffType === DIFF_NEW && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-emerald-100 text-emerald-800">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            New since last review
          </span>
        </div>
      )}
      {diffType === DIFF_MODIFIED && (
        <div className="mb-2 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-sky-100 text-sky-800">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
            Modified since last review
          </span>
          {previousBlock && (
            <button
              type="button"
              onClick={() => setShowPrev(v => !v)}
              className="text-xs text-optio-purple hover:text-optio-pink underline"
            >
              {showPrev ? 'Hide previous version' : 'View previous version'}
            </button>
          )}
        </div>
      )}
      {diffType === DIFF_REMOVED && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-gray-200 text-gray-700">
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
            </svg>
            Removed since last review
          </span>
        </div>
      )}
      {renderBlockBody(block)}
      {diffType === DIFF_MODIFIED && showPrev && previousBlock && (
        <div className="mt-3 pt-3 border-t border-dashed border-gray-300">
          <p className="text-xs text-gray-500 italic mb-2">Previous version:</p>
          {renderBlockBody(previousBlock)}
        </div>
      )}
    </div>
  )
}

export { getBlockText, getBlockItems, renderBlockBody }
export default EvidenceBlockCard
