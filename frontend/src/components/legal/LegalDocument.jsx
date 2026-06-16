import React from 'react'
import { Link } from 'react-router-dom'

/**
 * Renders a shared LegalDocument (from shared/legal) as HTML.
 *
 * The document content is the single source of truth shared with the v2 mobile
 * app; this component only handles web presentation. See shared/legal/types.ts.
 */

function renderInline(node, key) {
  if (typeof node === 'string') return <React.Fragment key={key}>{node}</React.Fragment>
  if ('bold' in node) return <strong key={key}>{node.bold}</strong>
  if ('link' in node) {
    const isInternal = node.href.startsWith('/')
    if (isInternal) {
      return (
        <Link key={key} to={node.href} className="text-primary hover:text-optio-purple underline">
          {node.link}
        </Link>
      )
    }
    return (
      <a
        key={key}
        href={node.href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary hover:text-optio-purple underline"
      >
        {node.link}
      </a>
    )
  }
  return null
}

function RichText({ value }) {
  if (typeof value === 'string') return value
  return value.map((node, i) => renderInline(node, i))
}

function Block({ block }) {
  switch (block.type) {
    case 'subheading':
      return <h3 className="text-xl font-semibold mb-3">{block.text}</h3>
    case 'paragraph':
      return (
        <p className={`mb-4${block.emphasis ? ' font-semibold' : ''}`}>
          <RichText value={block.text} />
        </p>
      )
    case 'list':
      return (
        <ul className="list-disc ml-6 mb-4">
          {block.items.map((item, i) => (
            <li key={i}>
              <RichText value={item} />
            </li>
          ))}
        </ul>
      )
    case 'callout': {
      const tone =
        block.variant === 'success'
          ? 'bg-green-50 border-green-400'
          : 'bg-yellow-50 border-yellow-400'
      return (
        <div className={`${tone} border-l-4 p-4 mb-4`}>
          {block.title && (
            <p className="mb-2 font-semibold text-gray-900">{block.title}</p>
          )}
          {block.blocks.map((inner, i) => (
            <Block key={i} block={inner} />
          ))}
        </div>
      )
    }
    case 'contact':
      return (
        <p className="mb-4">
          {block.lines.map((line, i) => (
            <React.Fragment key={i}>
              <RichText value={line} />
              {i < block.lines.length - 1 && <br />}
            </React.Fragment>
          ))}
        </p>
      )
    default:
      return null
  }
}

export default function LegalDocument({ document }) {
  return (
    <div className="min-h-screen bg-background py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        <div className="bg-white shadow-lg rounded-lg p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-8">{document.title}</h1>

          <div className="prose prose-gray max-w-none">
            <p className="text-sm text-gray-600 mb-6">Effective Date: {document.effectiveDate}</p>

            {document.preamble?.map((block, i) => (
              <Block key={`pre-${i}`} block={block} />
            ))}

            {document.sections.map((section, i) => (
              <section key={i} className="mb-8">
                <h2 className="text-2xl font-semibold mb-4">{section.heading}</h2>
                {section.blocks.map((block, j) => (
                  <Block key={j} block={block} />
                ))}
              </section>
            ))}
          </div>

          <div className="mt-8 pt-8 border-t border-gray-200">
            <Link to="/register" className="text-primary hover:text-optio-purple font-medium">
              ← Back to Registration
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
