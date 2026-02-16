import React, { useState, useEffect, memo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Helmet } from 'react-helmet-async'
import ReactMarkdown from 'react-markdown'
import { ClockIcon } from '@heroicons/react/24/outline'
import DocsLayout from '../../components/docs/DocsLayout'
import DocsBreadcrumbs from '../../components/docs/DocsBreadcrumbs'
import api from '../../services/api'

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

const DocsArticlePage = () => {
  const { categorySlug, articleSlug } = useParams()
  const [article, setArticle] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    loadArticle()
  }, [articleSlug])

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
            <ReactMarkdown>{article.content}</ReactMarkdown>
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
