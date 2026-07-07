import React, { useState, useEffect, useCallback, memo } from 'react'
import { Link, useParams, useLocation } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import { ClockIcon, LinkIcon } from '@heroicons/react/24/outline'
import { CheckIcon } from '@heroicons/react/24/solid'
import toast from 'react-hot-toast'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsBreadcrumbs from '../../components/docs/DocsBreadcrumbs'
import DocsMarkdown from '../../components/docs/DocsMarkdown'
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

          <DocsMarkdown content={article.content} components={markdownComponents} />
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
