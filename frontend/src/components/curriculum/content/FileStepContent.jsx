/**
 * FileStepContent Component
 *
 * Renders file attachments for a lesson step.
 * Supports images, PDFs, videos, audio, and other file types.
 */

import {
  PaperClipIcon,
  ArrowDownTrayIcon,
} from '@heroicons/react/24/outline'
import { getFileType } from '../utils/contentUtils'
import TextStepContent from './TextStepContent'

const FileRenderer = ({ file }) => {
  const fileType = getFileType(file)

  return (
    <div className="space-y-2">
      {/* IMAGE - display inline */}
      {fileType === 'image' && (
        <div className="rounded-xl overflow-hidden bg-gray-100 shadow-lg">
          <img
            src={file.url}
            alt={file.name || 'Image'}
            className="w-full h-auto max-h-[600px] object-contain"
          />
        </div>
      )}

      {/* PDF - embed viewer */}
      {fileType === 'pdf' && (
        <div className="rounded-xl overflow-hidden bg-gray-100 shadow-lg" style={{ height: '600px' }}>
          <iframe
            src={`${file.url}#toolbar=0&navpanes=0&scrollbar=1&view=FitH`}
            className="w-full h-full"
            title={file.name || 'PDF Document'}
          />
        </div>
      )}

      {/* VIDEO - native player */}
      {fileType === 'video' && (
        <div className="rounded-xl overflow-hidden bg-gray-100 shadow-lg">
          <video
            src={file.url}
            controls
            className="w-full max-h-[500px]"
          >
            Your browser does not support the video tag.
          </video>
        </div>
      )}

      {/* AUDIO - native player */}
      {fileType === 'audio' && (
        <div className="p-4 bg-gray-50 rounded-xl border border-gray-200">
          <p className="text-sm font-medium text-gray-900 mb-3">{file.name}</p>
          <audio src={file.url} controls className="w-full">
            Your browser does not support the audio tag.
          </audio>
        </div>
      )}

      {/* OTHER - download link */}
      {fileType === 'other' && (
        <a
          href={file.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors border border-gray-200"
        >
          <div className="w-12 h-12 flex items-center justify-center bg-optio-purple/10 rounded-lg flex-shrink-0">
            <PaperClipIcon className="w-6 h-6 text-optio-purple" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
            {file.size && (
              <p className="text-xs text-gray-500">
                {(file.size / 1024 / 1024).toFixed(2)} MB
              </p>
            )}
          </div>
          <ArrowDownTrayIcon className="w-5 h-5 text-optio-purple flex-shrink-0" />
        </a>
      )}

      {/* File name caption for media files */}
      {(fileType === 'image' || fileType === 'pdf' || fileType === 'video') && file.name && (
        <p className="text-sm text-gray-500 text-center">{file.name}</p>
      )}
    </div>
  )
}

export const FileStepContent = ({ step }) => {
  return (
    <div className="space-y-6">
      {/* Optional description */}
      {step.content && step.content !== '<p></p>' && (
        <TextStepContent content={step.content} />
      )}

      {/* Files displayed inline */}
      {step.files && step.files.length > 0 ? (
        <div className="space-y-6">
          {step.files.map((file, idx) => (
            <FileRenderer key={idx} file={file} />
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-gray-500">
          <PaperClipIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
          <p>No files attached</p>
        </div>
      )}
    </div>
  )
}

export default FileStepContent
