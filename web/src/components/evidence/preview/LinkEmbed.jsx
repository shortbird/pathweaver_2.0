import { useState } from 'react'
import { ArrowTopRightOnSquareIcon, LinkIcon } from '@heroicons/react/24/outline'
import { getEmbedUrl, hostLabel } from '../../../utils/embedUrl'
import { safeHref } from '../../../utils/safeHref'

/**
 * A linked page, shown in place.
 *
 * A reviewer judging a Google Doc or a Scratch project should not have to
 * leave the grader to look at it. The frame is sandboxed and sends no
 * referrer, and the "Open" link is always there because some sites refuse to
 * be framed and the browser says so only inside the frame itself.
 */
const LinkEmbed = ({ url, title }) => {
  const [shown, setShown] = useState(true)
  const embed = getEmbedUrl(url)
  const href = safeHref(url)
  const host = hostLabel(url)
  const label = title && title !== url ? title : host

  return (
    <div className="rounded-lg border border-gray-200 overflow-hidden bg-white">
      <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-b border-gray-200 text-sm">
        <LinkIcon className="w-4 h-4 text-gray-400 shrink-0" aria-hidden="true" />
        <span className="truncate font-medium text-gray-800">{label}</span>
        {label !== host && <span className="truncate text-xs text-gray-400">{host}</span>}
        <span className="flex-1" />
        {embed && (
          <button
            type="button"
            onClick={() => setShown(s => !s)}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 min-h-[32px] md:min-h-0 px-1 touch-manipulation"
          >
            {shown ? 'Hide' : 'Show'}
          </button>
        )}
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Open in new tab"
          className="inline-flex items-center gap-1 text-xs font-medium text-optio-purple hover:text-optio-purple-dark min-h-[32px] md:min-h-0 px-1 touch-manipulation"
        >
          <ArrowTopRightOnSquareIcon className="w-4 h-4" aria-hidden="true" />
          Open
        </a>
      </div>

      {embed && shown && (
        <>
          <iframe
            src={embed}
            title={label}
            loading="lazy"
            referrerPolicy="no-referrer"
            sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms"
            allow="fullscreen"
            className="w-full h-[70vh] min-h-[420px] max-h-[760px] bg-white"
          />
          <p className="px-3 py-1.5 text-[11px] text-gray-400 bg-gray-50 border-t border-gray-100">
            Some sites refuse to load inside another page. If this stays blank, open it in a new tab.
          </p>
        </>
      )}
    </div>
  )
}

export default LinkEmbed
