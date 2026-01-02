import React, { useState, useMemo } from 'react'
import { createPortal } from 'react-dom'
import {
  XMarkIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PencilIcon,
  CheckCircleIcon,
  PlayIcon,
  PaperClipIcon,
  ArrowDownTrayIcon,
  LinkIcon,
  ArrowTopRightOnSquareIcon,
} from '@heroicons/react/24/outline'
import { sanitizeHtml } from '../../utils/sanitize'

/**
 * Parse lesson content into steps
 * Handles both legacy (single HTML) and new (steps array) formats
 */
const parseContentToSteps = (content) => {
  if (!content) return []

  // New format: version 2 with steps array
  if (content.version === 2 && Array.isArray(content.steps)) {
    return content.steps.map(step => ({
      ...step,
      type: step.type || 'text',
    }))
  }

  // Legacy: blocks format
  if (content.blocks && Array.isArray(content.blocks)) {
    const html = content.blocks
      .filter(block => block.type === 'text')
      .map(block => block.content || '')
      .join('')
    return [{ id: 'legacy', type: 'text', title: 'Content', content: html, order: 0 }]
  }

  // Legacy: raw HTML string
  if (typeof content === 'string') {
    return [{ id: 'legacy', type: 'text', title: 'Content', content, order: 0 }]
  }

  return []
}

/**
 * Get file type from filename or URL
 */
const getFileType = (file) => {
  const name = (file.name || file.url || '').toLowerCase()
  if (/\.(jpg|jpeg|png|gif|webp|svg|bmp)$/i.test(name)) return 'image'
  if (/\.pdf$/i.test(name)) return 'pdf'
  if (/\.(mp4|webm|ogg|mov)$/i.test(name)) return 'video'
  if (/\.(mp3|wav|ogg|m4a)$/i.test(name)) return 'audio'
  return 'other'
}

/**
 * Get video embed URL from various providers
 */
const getVideoEmbedUrl = (url) => {
  if (!url) return null

  // YouTube
  const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/
  const youtubeMatch = url.match(youtubeRegex)
  if (youtubeMatch) {
    return `https://www.youtube-nocookie.com/embed/${youtubeMatch[1]}?rel=0&modestbranding=1`
  }

  // Vimeo
  const vimeoRegex = /vimeo\.com\/(?:video\/)?(\d+)/
  const vimeoMatch = url.match(vimeoRegex)
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  }

  // Google Drive
  const driveRegex = /drive\.google\.com\/(?:file\/d\/|open\?id=)([a-zA-Z0-9_-]+)/
  const driveMatch = url.match(driveRegex)
  if (driveMatch) {
    return `https://drive.google.com/file/d/${driveMatch[1]}/preview`
  }

  return null
}

/**
 * Beautiful step-based lesson preview modal
 * Shows content one step at a time with progress tracking
 */
const LessonPreviewModal = ({
  lesson,
  onClose,
  onEdit,
  onEditStep,
  initialStepIndex = 0,
}) => {
  const [currentStepIndex, setCurrentStepIndex] = useState(initialStepIndex)
  const [completedSteps, setCompletedSteps] = useState(new Set())

  const steps = useMemo(() => parseContentToSteps(lesson?.content), [lesson?.content])
  const currentStep = steps[currentStepIndex]
  const totalSteps = steps.length

  const goToNextStep = () => {
    if (currentStepIndex < totalSteps - 1) {
      setCompletedSteps(prev => new Set([...prev, currentStepIndex]))
      setCurrentStepIndex(currentStepIndex + 1)
    }
  }

  const goToPrevStep = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1)
    }
  }

  const goToStep = (index) => {
    setCurrentStepIndex(index)
  }

  if (!lesson) return null

  // Check if any step has content
  const hasContent = steps.length > 0 && steps.some(s =>
    (s.type === 'text' && s.content && s.content !== '<p></p>') ||
    (s.type === 'video' && s.video_url) ||
    (s.type === 'file' && s.files && s.files.length > 0)
  )

  // Get video embed URL for video steps
  const videoEmbedUrl = currentStep?.type === 'video' ? getVideoEmbedUrl(currentStep?.video_url) : null

  return createPortal(
    <div className="fixed top-0 left-0 right-0 bottom-0 bg-black/60 z-[9999] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl max-w-full sm:max-w-4xl mx-2 sm:mx-0 w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
        {/* Header */}
        <div className="relative bg-white border-b border-gray-200 p-6">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors min-h-[44px] min-w-[44px]"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>

          <p className="text-xs font-medium uppercase tracking-wider text-gray-500 mb-1">
            Lesson Preview
          </p>
          <h2 className="text-2xl font-bold text-gray-900 pr-12">{lesson.title}</h2>

          {/* Step indicators */}
          {totalSteps > 1 && (
            <div className="mt-4 flex items-center gap-3">
              {steps.map((step, index) => (
                <button
                  key={step.id || index}
                  onClick={() => goToStep(index)}
                  className="flex items-center gap-1.5 group"
                  title={step.title || `Step ${index + 1}`}
                >
                  <div
                    className={`w-6 h-6 rounded flex items-center justify-center text-xs font-medium transition-all ${
                      completedSteps.has(index)
                        ? 'bg-green-100 text-green-600'
                        : index === currentStepIndex
                        ? 'bg-optio-purple text-white'
                        : 'bg-gray-100 text-gray-500 group-hover:bg-gray-200'
                    }`}
                  >
                    {completedSteps.has(index) ? (
                      <CheckCircleIcon className="w-5 h-5" />
                    ) : (
                      index + 1
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Content area */}
        <div className="flex-1 max-h-[70vh] overflow-y-auto">
          {hasContent && currentStep ? (
            <div className="p-8">
              {/* Current step title */}
              {totalSteps > 1 && (
                <h3 className="text-xl font-bold text-gray-900 mb-6 pb-4 border-b border-gray-200">
                  {currentStep.title || `Step ${currentStepIndex + 1}`}
                </h3>
              )}

              {/* TEXT STEP */}
              {currentStep.type === 'text' && currentStep.content && (
                <div
                  className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-200 prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-6 prose-li:text-gray-700 prose-li:my-1 prose-strong:text-gray-900 prose-blockquote:border-l-4 prose-blockquote:border-optio-purple prose-blockquote:bg-optio-purple/5 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-a:text-optio-purple prose-a:no-underline hover:prose-a:underline prose-code:text-sm prose-code:overflow-x-auto prose-pre:text-sm prose-pre:overflow-x-auto [&>p+p]:mt-6"
                  dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentStep.content) }}
                />
              )}

              {/* VIDEO STEP */}
              {currentStep.type === 'video' && (
                <div className="space-y-6">
                  {/* Optional description */}
                  {currentStep.content && currentStep.content !== '<p></p>' && (
                    <div
                      className="prose prose-lg max-w-none prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-6 [&>p+p]:mt-6"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentStep.content) }}
                    />
                  )}

                  {/* Video player */}
                  {videoEmbedUrl ? (
                    <div className="aspect-video rounded-xl overflow-hidden bg-gray-100 shadow-lg">
                      <iframe
                        src={videoEmbedUrl}
                        className="w-full h-full"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        title={currentStep.title || lesson.title}
                      />
                    </div>
                  ) : (
                    <div className="aspect-video rounded-xl bg-gray-100 flex items-center justify-center">
                      <div className="text-center text-gray-500">
                        <PlayIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                        <p>No video URL provided</p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* FILE STEP */}
              {currentStep.type === 'file' && (
                <div className="space-y-6">
                  {/* Optional description */}
                  {currentStep.content && currentStep.content !== '<p></p>' && (
                    <div
                      className="prose prose-lg max-w-none prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-6 [&>p+p]:mt-6"
                      dangerouslySetInnerHTML={{ __html: sanitizeHtml(currentStep.content) }}
                    />
                  )}

                  {/* Files displayed inline */}
                  {currentStep.files && currentStep.files.length > 0 ? (
                    <div className="space-y-6">
                      {currentStep.files.map((file, idx) => {
                        const fileType = getFileType(file)

                        return (
                          <div key={idx} className="space-y-2">
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

                            {/* PDF - embed viewer without toolbar */}
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
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-gray-500">
                      <PaperClipIcon className="w-12 h-12 mx-auto mb-2 text-gray-400" />
                      <p>No files attached</p>
                    </div>
                  )}
                </div>
              )}

              {/* LINKS - shown for any step type */}
              {currentStep.links && currentStep.links.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Links</h4>
                  <div className="flex flex-wrap gap-2">
                    {currentStep.links.map((link, idx) => (
                      <a
                        key={idx}
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors text-sm"
                      >
                        <LinkIcon className="w-4 h-4 text-blue-500" />
                        <span className="text-blue-700">{link.displayText || link.url}</span>
                        <ArrowTopRightOnSquareIcon className="w-3 h-3 text-blue-400" />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* ATTACHMENTS - shown for any step type */}
              {currentStep.attachments && currentStep.attachments.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Attachments</h4>
                  <div className="flex flex-wrap gap-2">
                    {currentStep.attachments.map((file, idx) => (
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
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 text-gray-500">
              <div className="w-16 h-16 mb-4 rounded-full bg-gray-100 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-lg font-medium">No content yet</p>
              <p className="text-sm">This lesson is empty. Click Edit to add content.</p>
            </div>
          )}
        </div>

        {/* Footer with navigation */}
        <div className="p-4 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {totalSteps > 1 && (
              <button
                onClick={goToPrevStep}
                disabled={currentStepIndex === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-h-[44px]"
              >
                <ChevronLeftIcon className="w-4 h-4" />
                Previous
              </button>
            )}
          </div>

          <div className="flex items-center gap-3">
            {onEdit && (
              <button
                onClick={() => {
                  onClose()
                  onEdit(lesson)
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-optio-purple hover:bg-optio-purple/10 rounded-lg transition-colors min-h-[44px]"
              >
                <PencilIcon className="w-4 h-4" />
                Edit Lesson
              </button>
            )}

            {onEditStep && currentStep && (
              <button
                onClick={() => {
                  onClose()
                  onEditStep(currentStep, currentStepIndex)
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-optio-purple bg-white border border-optio-purple rounded-lg hover:bg-optio-purple/10 transition-colors min-h-[44px]"
              >
                <PencilIcon className="w-4 h-4" />
                Edit Step
              </button>
            )}

            {totalSteps > 1 && currentStepIndex < totalSteps - 1 ? (
              <button
                onClick={goToNextStep}
                className="flex items-center gap-2 px-6 py-2 text-sm font-medium text-white bg-optio-purple rounded-lg hover:bg-optio-purple/90 transition-colors min-h-[44px]"
              >
                Continue
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            ) : (
              <button
                onClick={onClose}
                className="px-6 py-2 text-sm font-medium text-white bg-optio-purple rounded-lg hover:bg-optio-purple/90 transition-colors min-h-[44px]"
              >
                {totalSteps > 1 ? 'Finish' : 'Close'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  )
}

export default LessonPreviewModal
