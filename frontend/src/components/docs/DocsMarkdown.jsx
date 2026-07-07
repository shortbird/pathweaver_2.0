import React from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Link } from 'react-router-dom'

/**
 * DocsMarkdown - shared markdown renderer for the help center.
 *
 * Used by both the public article page and the admin editor preview so
 * what admins see while writing is exactly what readers get.
 *
 * Conventions:
 * - GFM enabled (tables, strikethrough, task lists)
 * - External links (http/https) open in a new tab; internal paths use the router
 * - Images render as screenshot cards by default. An alt-text suffix of "|badge"
 *   renders the image inline at badge height (used for app store buttons):
 *   ![Get it on Google Play|badge](url)
 */

export const docsProseClasses = `
  prose prose-lg max-w-none docs-prose
  prose-headings:font-bold prose-headings:text-gray-900
  prose-h1:text-4xl
  prose-h2:text-2xl prose-h2:text-optio-purple prose-h2:border-l-4 prose-h2:border-optio-purple prose-h2:pl-4
  prose-h3:text-xl
  prose-p:text-gray-700 prose-p:leading-relaxed
  prose-a:text-optio-purple-light prose-a:font-medium prose-a:no-underline hover:prose-a:underline prose-a:underline-offset-4 prose-a:decoration-2 prose-a:transition-all
  prose-strong:text-gray-900 prose-strong:font-semibold
  prose-em:italic prose-em:text-gray-600
  prose-ul:text-gray-700 prose-ul:my-4
  prose-ol:text-gray-700 prose-ol:my-4
  prose-li:my-1.5
  prose-code:bg-gray-100 prose-code:px-2 prose-code:py-0.5 prose-code:rounded prose-code:text-sm prose-code:font-mono prose-code:text-optio-purple
  prose-pre:bg-gray-900 prose-pre:text-gray-100 prose-pre:rounded-xl prose-pre:p-5 prose-pre:shadow-lg
  prose-blockquote:border-l-4 prose-blockquote:border-optio-purple prose-blockquote:pl-6 prose-blockquote:italic prose-blockquote:text-gray-600 prose-blockquote:bg-gradient-to-r prose-blockquote:from-optio-purple/5 prose-blockquote:to-transparent prose-blockquote:py-2
  prose-table:text-sm prose-table:!my-0
  prose-thead:bg-gray-50
  prose-th:px-4 prose-th:py-2.5 prose-th:text-left prose-th:font-semibold prose-th:text-gray-900
  prose-td:px-4 prose-td:py-2.5 prose-td:text-gray-700 prose-td:align-top
  prose-tr:border-b prose-tr:border-gray-100
`.trim()

const linkClasses = 'text-optio-purple-light font-medium no-underline hover:underline underline-offset-4 decoration-2 transition-all'

const isExternal = (href) => /^https?:\/\//i.test(href || '')

const MarkdownLink = ({ href, children }) => {
  if (isExternal(href)) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={linkClasses}>
        {children}
      </a>
    )
  }
  return (
    <Link to={href || '#'} className={linkClasses}>
      {children}
    </Link>
  )
}

const MarkdownImage = ({ src, alt }) => {
  const [label, variant] = (alt || '').split('|')
  if (variant === 'badge') {
    return (
      <img
        src={src}
        alt={label}
        className="inline-block h-12 w-auto !my-0 mr-3 align-middle"
      />
    )
  }
  return (
    <img
      src={src}
      alt={label}
      loading="lazy"
      className="block max-w-full rounded-xl border border-gray-200 shadow-md"
    />
  )
}

const MarkdownTable = ({ children }) => (
  <div className="not-prose-scroll overflow-x-auto my-6 rounded-xl border border-gray-200">
    <table className="!my-0 min-w-full">{children}</table>
  </div>
)

const DocsMarkdown = ({ content, components = {} }) => (
  <div className={docsProseClasses}>
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: MarkdownLink,
        img: MarkdownImage,
        table: MarkdownTable,
        ...components,
      }}
    >
      {content}
    </ReactMarkdown>
  </div>
)

export default DocsMarkdown
