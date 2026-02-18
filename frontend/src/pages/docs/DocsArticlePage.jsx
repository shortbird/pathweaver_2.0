import React, { useState, useEffect, useCallback, memo } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import ReactMarkdown from 'react-markdown'
import { ClockIcon, LinkIcon } from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsBreadcrumbs from '../../components/docs/DocsBreadcrumbs'
import api from '../../services/api'

const slugify = (text) =>
  text.toLowerCase().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').replace(/-+/g, '-').trim()

const HeadingWithAnchor = ({ level, children, activeHash }) => {
  const [copied, setCopied] = useState(false)
  const text = typeof children === 'string'
    ? children
    : Array.isArray(children)
      ? children.map(c => (typeof c === 'string' ? c : c?.props?.children || '')).join('')
      : ''
  const id = slugify(text)
  const Tag = `h${level}`
  const isActive = activeHash === id

  const handleCopy = (e) => {
    e.preventDefault()
    const url = `${window.location.origin}${window.location.pathname}#${id}`
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      toast.success('Link copied')
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <Tag
      id={id}
      className={`group scroll-mt-24 transition-colors duration-700 rounded-r-md ${
        isActive ? 'bg-optio-purple/10 -ml-3 pl-3 -mr-3 pr-3' : ''
      }`}
    >
      {children}
      <button
        onClick={handleCopy}
        className="inline-flex items-center ml-2 opacity-0 group-hover:opacity-100 transition-opacity align-middle"
        aria-label={`Copy link to ${text}`}
      >
        {copied
          ? <CheckIcon className="w-4 h-4 text-green-500" />
          : <LinkIcon className="w-4 h-4 text-gray-400 hover:text-optio-purple" />
        }
      </button>
    </Tag>
  )
}

const proseClasses = `
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
`.trim()

const DocsArticlePage = () => {
  const { categorySlug, articleSlug } = useParams()
  const location = useLocation()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [activeHash, setActiveHash] = useState('')

  useEffect(() => {
    loadArticle()
  }, [articleSlug])

  // Scroll to hash anchor after article loads and highlight it
  useEffect(() => {
    if (!loading && article && location.hash) {
      const id = location.hash.slice(1)
      setActiveHash(id)
      setTimeout(() => {
        const el = document.getElementById(id)
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
      // Fade out highlight after 3 seconds
      const timer = setTimeout(() => setActiveHash(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [loading, article, location.hash])

  const markdownComponents = {
    h1: ({ children }) => <HeadingWithAnchor level={1} activeHash={activeHash}>{children}</HeadingWithAnchor>,
    h2: ({ children }) => <HeadingWithAnchor level={2} activeHash={activeHash}>{children}</HeadingWithAnchor>,
    h3: ({ children }) => <HeadingWithAnchor level={3} activeHash={activeHash}>{children}</HeadingWithAnchor>,
    h4: ({ children }) => <HeadingWithAnchor level={4} activeHash={activeHash}>{children}</HeadingWithAnchor>,
    a: ({ href, children }) => (
      <Link to={href} className="text-optio-purple-light font-medium no-underline hover:underline underline-offset-4 decoration-2 transition-all">
        {children}
      </Link>
    ),
  }

  const loadArticle = async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/api/public/docs/articles/${articleSlug}`)
      setArticle(res.data.article)
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Article not found')
      } else {
        setError('Failed to load article')
      }
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return ''
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <DocsLayout>
        <div className="space-y-4">
          <div className="h-6 bg-gray-100 rounded w-64 animate-pulse" />
          <div className="h-10 bg-gray-100 rounded w-3/4 animate-pulse" />
          <div className="h-4 bg-gray-50 rounded w-48 animate-pulse" />
          <div className="space-y-3 mt-8">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="h-4 bg-gray-50 rounded animate-pulse" style={{ width: `${80 + Math.random() * 20}%` }} />
            ))}
          </div>
        </div>
      </DocsLayout>
    )
  }

  if (error || !article) {
    return (
      <DocsLayout>
        <div className="text-center py-16">
          <h2 className="text-xl font-semibold text-gray-600 mb-2">{error || 'Article not found'}</h2>
          <Link to="/docs" className="text-optio-purple hover:underline">Back to Help Center</Link>
        </div>
      </DocsLayout>
    )
  }

  const category = article.category || { title: 'Docs', slug: categorySlug }

  return (
    <>
      <Helmet>
        <title>{article.title} | Help Center | Optio</title>
        <meta name="description" content={article.summary || article.title} />
      </Helmet>

      <DocsLayout>
        <DocsBreadcrumbs category={category} article={article} />

        <article>
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-3">{article.title}</h1>
            {article.updated_at && (
              <div className="flex items-center gap-1.5 text-sm text-gray-400">
                <ClockIcon className="w-4 h-4" />
                <span>Updated {formatDate(article.updated_at)}</span>
              </div>
            )}
            {article.target_roles?.length > 0 && (
              <div className="flex gap-1.5 mt-3">
                {article.target_roles.map(role => (
                  <span key={role} className="text-xs px-2 py-0.5 bg-optio-purple/10 text-optio-purple rounded-full">
                    {role}
                  </span>
                ))}
              </div>
            )}
          </header>

          <div className={proseClasses}>
            <ReactMarkdown components={markdownComponents}>{article.content}</ReactMarkdown>
          </div>
        </article>

        {/* Back to category link */}
        <div className="mt-12 pt-6 border-t border-gray-200">
          <Link
            to={`/docs/${category.slug}`}
            className="text-optio-purple hover:underline text-sm"
          >
            &larr; Back to {category.title}
          </Link>
        </div>
      </DocsLayout>
    </>
  )
}

export default memo(DocsArticlePage)
