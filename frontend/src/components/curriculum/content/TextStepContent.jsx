/**
 * TextStepContent Component
 *
 * Renders text/HTML content for a lesson step with prose styling.
 * Uses DOMPurify for XSS protection.
 */

import { sanitizeHtml } from '../../../utils/sanitize'

export const TextStepContent = ({ content }) => {
  if (!content || content === '<p></p>') return null

  return (
    <div
      className="prose prose-lg max-w-none prose-headings:font-bold prose-headings:text-gray-900 prose-h2:text-xl prose-h2:mt-8 prose-h2:mb-4 prose-h2:pb-2 prose-h2:border-b prose-h2:border-gray-200 prose-h3:text-lg prose-h3:mt-6 prose-h3:mb-3 prose-p:text-gray-700 prose-p:leading-relaxed prose-p:mb-6 prose-li:text-gray-700 prose-li:my-1 prose-strong:text-gray-900 prose-blockquote:border-l-4 prose-blockquote:border-optio-purple prose-blockquote:bg-optio-purple/5 prose-blockquote:py-2 prose-blockquote:px-4 prose-blockquote:rounded-r-lg prose-blockquote:not-italic prose-a:text-optio-purple prose-a:no-underline hover:prose-a:underline [&>p+p]:mt-6"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(content) }}
    />
  )
}

export default TextStepContent
