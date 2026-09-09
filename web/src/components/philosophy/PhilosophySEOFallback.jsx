import React from 'react'
import DOMPurify from 'dompurify'

/**
 * PhilosophySEOFallback - Renders all philosophy content as semantic HTML.
 * Visually hidden (sr-only) but crawlable by search engines.
 * Also rendered inside <noscript> for non-JS crawlers.
 */
const PhilosophySEOFallback = ({ nodes }) => {
  if (!nodes || nodes.length === 0) return null

  const topLevel = nodes
    .filter((n) => n.data.level === 0 || n.data.level === 1)
    .sort((a, b) => (a.data.sortOrder || 0) - (b.data.sortOrder || 0))

  const level2 = nodes.filter((n) => n.data.level === 2)

  const content = (
    <div>
      <h1>The Optio Philosophy</h1>
      {topLevel.map((node) => {
        const children = level2.filter(
          (c) => c.data.parentNodeId === node.id
        )
        return (
          <article key={node.id}>
            <h2>{node.data.label}</h2>
            {node.data.summary && <p>{node.data.summary}</p>}
            {node.data.detailContent && (
              <div
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(node.data.detailContent),
                }}
              />
            )}
            {children.length > 0 && (
              <div>
                {children.map((child) => (
                  <section key={child.id}>
                    <h3>{child.data.label}</h3>
                    {child.data.summary && <p>{child.data.summary}</p>}
                    {child.data.detailContent && (
                      <div
                        dangerouslySetInnerHTML={{
                          __html: DOMPurify.sanitize(child.data.detailContent),
                        }}
                      />
                    )}
                  </section>
                ))}
              </div>
            )}
          </article>
        )
      })}
    </div>
  )

  return (
    <>
      {/* sr-only for JS-executing crawlers */}
      <div className="sr-only" aria-hidden="false">
        {content}
      </div>
      {/* noscript for non-JS crawlers */}
      <noscript>{content}</noscript>
    </>
  )
}

export default PhilosophySEOFallback
