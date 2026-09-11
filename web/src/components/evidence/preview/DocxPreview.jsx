import { useEffect, useState } from 'react'
import { ArrowTopRightOnSquareIcon, DocumentIcon } from '@heroicons/react/24/outline'
import { sanitizeHtml } from '../../../utils/sanitize'

// Images inside a .docx come out of mammoth as data: URIs. The default
// sanitizer refuses data: everywhere, which is right for a link and wrong for
// a picture the student embedded in their essay -- so images, and only images,
// are let through.
const DOCX_URI_REGEXP =
  /^(?:(?:https?|mailto|tel):|data:image\/(?:png|jpe?g|gif|webp);base64,|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

/**
 * A Word document, rendered in the page.
 *
 * Converted in the browser (mammoth: .docx to HTML), so the file never goes to
 * a third-party viewer. A signed storage URL for a minor's schoolwork is not
 * something to hand Google or Microsoft in exchange for a preview. Formatting
 * is approximate -- headings, lists, tables, bold, images -- which is enough to
 * read an essay without downloading it. The download stays one click away.
 */
const DocxPreview = ({ url, title }) => {
  const [state, setState] = useState({ status: 'loading', html: '' })

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      try {
        const res = await fetch(url)
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const arrayBuffer = await res.arrayBuffer()
        const mod = await import('mammoth/mammoth.browser')
        const mammoth = mod.default || mod
        const { value } = await mammoth.convertToHtml({ arrayBuffer })
        if (!cancelled) setState({ status: 'ready', html: value })
      } catch (err) {
        console.error('docx preview failed:', err)
        if (!cancelled) setState({ status: 'error', html: '' })
      }
    }
    run()
    return () => { cancelled = true }
  }, [url])

  const displayTitle = title || 'Document'

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-sm">
        <DocumentIcon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
        <span className="truncate font-medium text-gray-800">{displayTitle}</span>
        <span className="flex-1" />
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in new tab"
          className="inline-flex items-center gap-1 text-xs font-medium text-optio-purple hover:text-optio-purple-dark min-h-[32px] md:min-h-0 px-1 touch-manipulation"
        >
          <ArrowTopRightOnSquareIcon className="w-4 h-4" aria-hidden="true" />
          Download
        </a>
      </div>

      {state.status === 'loading' && (
        <div role="status" aria-label="Loading document" className="flex items-center justify-center py-10">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-optio-purple" />
        </div>
      )}

      {state.status === 'error' && (
        <p className="px-4 py-6 text-sm text-gray-500">
          This document could not be shown here. Download it to read it.
        </p>
      )}

      {state.status === 'ready' && (
        <div
          className="rich-body prose max-w-none px-5 py-4 text-sm text-gray-800 max-h-[70vh] overflow-y-auto"
          // Sanitized at the injection site, where the S2 lint looks for it.
          dangerouslySetInnerHTML={{ __html: sanitizeHtml(state.html, {
            ALLOWED_URI_REGEXP: DOCX_URI_REGEXP,
          }) }}
        />
      )}
    </div>
  )
}

export default DocxPreview
