/**
 * StepAttachments Component
 *
 * Renders downloadable attachments for a lesson step.
 */

import { ArrowDownTrayIcon } from '@heroicons/react/24/outline'

export const StepAttachments = ({ attachments }) => {
  if (!attachments || attachments.length === 0) return null

  return (
    <div className="mt-6 pt-6 border-t border-gray-200">
      <h4 className="text-sm font-medium text-gray-700 mb-3">Attachments</h4>
      <div className="flex flex-wrap gap-2">
        {attachments.map((file, idx) => (
          <a
            key={idx}
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors text-sm"
          >
            <ArrowDownTrayIcon className="w-4 h-4 text-gray-500" />
            <span className="text-gray-700">{file.displayName || file.name}</span>
          </a>
        ))}
      </div>
    </div>
  )
}

export default StepAttachments
