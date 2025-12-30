import React from 'react'
import ReactMarkdown from 'react-markdown'
import {
  PlayIcon,
  DocumentTextIcon,
  PaperClipIcon,
  InformationCircleIcon,
  LightBulbIcon,
  ExclamationTriangleIcon,
  SparklesIcon,
  LinkIcon,
  ArrowDownTrayIcon,
  VideoCameraIcon,
} from '@heroicons/react/24/outline'
import { CALLOUT_VARIANTS } from './blocks/index'

// Helper to extract YouTube/Vimeo embed URL
const getEmbedUrl = (url) => {
  if (!url) return null

  // YouTube
  const youtubeMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/)
  if (youtubeMatch) {
    return `https://www.youtube.com/embed/${youtubeMatch[1]}`
  }

  // Vimeo
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/)
  if (vimeoMatch) {
    return `https://player.vimeo.com/video/${vimeoMatch[1]}`
  }

  // Google Drive
  if (url.includes('drive.google.com')) {
    const driveMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/)
    if (driveMatch) {
      return `https://drive.google.com/file/d/${driveMatch[1]}/preview`
    }
  }

  // Loom
  if (url.includes('loom.com')) {
    const loomMatch = url.match(/loom\.com\/share\/([a-zA-Z0-9]+)/)
    if (loomMatch) {
      return `https://www.loom.com/embed/${loomMatch[1]}`
    }
  }

  return url
}

/**
 * LessonContentRenderer - Renders lesson content (blocks, steps, or raw markdown)
 *
 * Supports three content formats:
 * 1. Version 2 steps: { version: 2, steps: [{ type, title, content, video_url, files, links }] }
 * 2. Blocks array: { blocks: [{ type: 'text'|'iframe'|'document', content: '...', data: {...} }] }
 * 3. Raw markdown string (legacy support)
 *
 * Used in both student-facing views and admin preview.
 */
const LessonContentRenderer = ({ content, className = '' }) => {
  // Handle empty content
  if (!content) {
    return (
      <p className="text-gray-400 italic">No content yet.</p>
    )
  }

  // Enhanced prose styling for markdown
  const proseClasses = `
    prose prose-lg max-w-none
    prose-headings:font-bold prose-headings:text-gray-900
    prose-h1:text-4xl prose-h1:mb-6 prose-h1:mt-8
    prose-h2:text-2xl prose-h2:mb-4 prose-h2:mt-6 prose-h2:text-optio-purple prose-h2:border-l-4 prose-h2:border-optio-purple prose-h2:pl-4
    prose-h3:text-xl prose-h3:mb-3 prose-h3:mt-5
    prose-p:text-gray-700 prose-p:leading-relaxed prose-p:my-3
    prose-a:text-optio-purple prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-4 prose-a:decoration-2 prose-a:transition-all
    prose-strong:text-gray-900 prose-strong:font-semibold
    prose-em:italic prose-em:text-gray-600
    prose-ul:text-gray-700 prose-ul:my-4
    prose-ol:text-gray-700 prose-ol:my-4
    prose-li:my-1.5
    prose-code:bg-gray-100 prose-code:px-2 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:text-optio-purple
    prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-xl prose-pre:p-5 prose-pre:shadow-lg
    prose-blockquote:border-l-4 prose-blockquote:border-optio-purple prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-gray-600 prose-blockquote:bg-gradient-to-r prose-blockquote:from-optio-purple/5 prose-blockquote:to-transparent prose-blockquote:py-2
  `.trim()

  // Handle Version 2 step-based format
  if (content.version === 2 && Array.isArray(content.steps)) {
    const steps = content.steps.sort((a, b) => (a.order || 0) - (b.order || 0))

    if (steps.length === 0) {
      return <p className="text-gray-400 italic">No content yet.</p>
    }

    return (
      <div className={`space-y-8 ${className}`}>
        {steps.map((step, index) => {
          const embedUrl = step.video_url ? getEmbedUrl(step.video_url) : null

          return (
            <div key={step.id || index} className="relative">
              {/* Step Header */}
              <div className="flex items-center gap-3 mb-4">
                <span className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-full text-sm font-bold">
                  {index + 1}
                </span>
                <h3 className="text-xl font-semibold text-gray-900">
                  {step.title || `Step ${index + 1}`}
                </h3>
              </div>

              {/* Step Content */}
              <div className="pl-11 space-y-4">
                {/* Text Content */}
                {step.content && step.content !== '<p></p>' && (
                  <div className={proseClasses}>
                    <div dangerouslySetInnerHTML={{ __html: step.content }} />
                  </div>
                )}

                {/* Video Embed */}
                {step.type === 'video' && embedUrl && (
                  <div className="my-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <VideoCameraIcon className="w-4 h-4" />
                      <span>Video</span>
                    </div>
                    <div className="relative w-full aspect-video bg-gray-100 rounded-xl overflow-hidden shadow-lg">
                      <iframe
                        src={embedUrl}
                        title={step.title || 'Video content'}
                        className="absolute inset-0 w-full h-full"
                        allowFullScreen
                        loading="lazy"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      />
                    </div>
                  </div>
                )}

                {/* Files/Attachments */}
                {step.attachments && step.attachments.length > 0 && (
                  <div className="my-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <ArrowDownTrayIcon className="w-4 h-4" />
                      <span>Downloads</span>
                    </div>
                    <div className="space-y-2">
                      {step.attachments.map((file, idx) => (
                        <a
                          key={idx}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all group"
                        >
                          <div className="p-2 bg-white rounded-lg shadow-sm">
                            <DocumentTextIcon className="w-5 h-5 text-optio-purple" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 group-hover:text-optio-purple transition-colors truncate">
                              {file.displayName || file.name || 'Download File'}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Files (file step type) */}
                {step.files && step.files.length > 0 && (
                  <div className="my-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <ArrowDownTrayIcon className="w-4 h-4" />
                      <span>Files</span>
                    </div>
                    <div className="space-y-2">
                      {step.files.map((file, idx) => (
                        <a
                          key={idx}
                          href={file.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all group"
                        >
                          <div className="p-2 bg-white rounded-lg shadow-sm">
                            <DocumentTextIcon className="w-5 h-5 text-optio-purple" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-gray-900 group-hover:text-optio-purple transition-colors truncate">
                              {file.name || 'Download File'}
                            </p>
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {/* Links */}
                {step.links && step.links.length > 0 && (
                  <div className="my-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
                      <LinkIcon className="w-4 h-4" />
                      <span>Resources</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {step.links.map((link, idx) => (
                        <a
                          key={idx}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 bg-optio-purple/10 text-optio-purple rounded-lg hover:bg-optio-purple/20 transition-colors text-sm font-medium"
                        >
                          <LinkIcon className="w-4 h-4" />
                          {link.displayText || link.text || link.url}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  // If content is a string, render as markdown (legacy format)
  if (typeof content === 'string') {
    return (
      <div className={`${proseClasses} ${className}`}>
        <ReactMarkdown>{content}</ReactMarkdown>
      </div>
    )
  }

  // If content has blocks array, render each block (legacy blocks format)
  const blocks = content.blocks || []

  if (blocks.length === 0) {
    return (
      <p className="text-gray-400 italic">No content yet.</p>
    )
  }

  return (
    <div className={`space-y-6 ${className}`}>
      {blocks.map((block, index) => (
        <div key={block.id || index}>
          {/* Text Block - HTML from TipTap or Markdown legacy */}
          {block.type === 'text' && block.content && (
            <div className={proseClasses}>
              {block.data?.format === 'html' || block.content.includes('<') ? (
                // Render HTML content from TipTap editor
                <div dangerouslySetInnerHTML={{ __html: block.content }} />
              ) : (
                // Legacy markdown content
                <ReactMarkdown>{block.content}</ReactMarkdown>
              )}
            </div>
          )}

          {/* Iframe Block - Video/Embed with gradient border on hover */}
          {block.type === 'iframe' && block.content && (
            <div className="my-6">
              {block.data?.title && (
                <h4 className="text-lg font-medium text-gray-900 mb-3 flex items-center gap-2">
                  <PlayIcon className="w-5 h-5 text-optio-purple" />
                  {block.data.title}
                </h4>
              )}
              <div className="relative w-full aspect-video bg-gray-100 rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-shadow group">
                <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-optio-purple to-optio-pink opacity-0 group-hover:opacity-100 transition-opacity" style={{ padding: '2px' }}>
                  <div className="w-full h-full bg-white rounded-xl overflow-hidden">
                    <iframe
                      src={block.content}
                      title={block.data?.title || 'Embedded content'}
                      className="w-full h-full"
                      allowFullScreen
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    />
                  </div>
                </div>
                <iframe
                  src={block.content}
                  title={block.data?.title || 'Embedded content'}
                  className="absolute inset-0 w-full h-full group-hover:opacity-0 transition-opacity"
                  allowFullScreen
                  loading="lazy"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                />
              </div>
            </div>
          )}

          {/* Document Block - File Link */}
          {block.type === 'document' && block.content && (
            <div className="my-6">
              <a
                href={block.content}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 hover:border-gray-300 transition-all group"
              >
                <div className="p-3 bg-white rounded-lg shadow-sm group-hover:shadow-md transition-shadow">
                  <PaperClipIcon className="w-6 h-6 text-optio-purple" />
                </div>
                <div>
                  <p className="font-medium text-gray-900 group-hover:text-optio-purple transition-colors">
                    {block.data?.title || 'View Document'}
                  </p>
                  <p className="text-sm text-gray-500">Click to open in new tab</p>
                </div>
              </a>
            </div>
          )}

          {/* Image Block - Rounded with shadow and caption */}
          {block.type === 'image' && block.content && (
            <div className="my-6">
              <img
                src={block.content}
                alt={block.data?.alt || 'Lesson image'}
                className={`w-full rounded-xl shadow-lg ${
                  block.data?.alignment === 'left' ? 'mr-auto max-w-2xl' :
                  block.data?.alignment === 'right' ? 'ml-auto max-w-2xl' :
                  'mx-auto max-w-3xl'
                }`}
              />
              {block.data?.caption && (
                <p className="text-sm text-gray-500 text-center mt-3 italic">
                  {block.data.caption}
                </p>
              )}
            </div>
          )}

          {/* Callout Block - Colored boxes with icons */}
          {block.type === 'callout' && block.content && (() => {
            const variant = block.data?.variant || 'info'
            const variantConfig = CALLOUT_VARIANTS[variant]
            const icons = {
              info: InformationCircleIcon,
              tip: LightBulbIcon,
              warning: ExclamationTriangleIcon,
              important: SparklesIcon,
            }
            const Icon = icons[variant] || InformationCircleIcon

            return (
              <div
                className={`my-6 flex gap-3 p-4 rounded-lg border-l-4 ${variantConfig.bg}`}
                style={{ borderLeftColor: variantConfig.borderColor }}
              >
                <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 ${variantConfig.iconColor}`} />
                <div className={`flex-1 text-sm leading-relaxed ${variantConfig.titleColor}`}>
                  {block.content}
                </div>
              </div>
            )
          })()}

          {/* Divider Block - Visual separators */}
          {block.type === 'divider' && (() => {
            const style = block.data?.style || 'line'

            if (style === 'line') {
              return <div className="my-8 border-t border-gray-300" />
            }

            if (style === 'dots') {
              return (
                <div className="my-8 flex items-center justify-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                </div>
              )
            }

            if (style === 'gradient') {
              return (
                <div className="my-8 h-px bg-gradient-to-r from-transparent via-optio-purple to-transparent" />
              )
            }

            return <div className="my-8 border-t border-gray-300" />
          })()}
        </div>
      ))}
    </div>
  )
}

export default LessonContentRenderer
