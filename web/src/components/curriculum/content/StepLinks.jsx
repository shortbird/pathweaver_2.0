/**
 * StepLinks Component
 *
 * Renders resource links for a lesson step.
 */

import {
  LinkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'

export const StepLinks = ({ links }) => {
  if (!links || links.length === 0) return null

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <h4 className="text-sm font-medium text-gray-700 mb-3">Resources</h4>
      <div className="flex flex-wrap gap-2">
        {links.map((link, idx) => (
          <a
            key={idx}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-2 bg-optio-purple/10 rounded-lg hover:bg-optio-purple/20 transition-colors text-sm"
          >
            <LinkIcon className="w-4 h-4 text-optio-purple" />
            <span className="text-optio-purple font-medium">
              {link.displayText || link.text || link.url}
            </span>
            <ArrowTopRightOnSquareIcon className="w-3 h-3 text-optio-purple/60" />
          </a>
        ))}
      </div>
    </div>
  )
}

export default StepLinks
