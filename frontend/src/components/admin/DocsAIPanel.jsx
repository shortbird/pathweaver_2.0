import React, { memo } from 'react'
import {
  XMarkIcon, SparklesIcon, ExclamationTriangleIcon,
  CheckCircleIcon, ArrowPathIcon, DocumentPlusIcon,
  FolderPlusIcon
} from '@heroicons/react/24/outline'
import ModalOverlay from '../ui/ModalOverlay'

const PRIORITY_COLORS = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-gray-100 text-gray-600'
}

const SEVERITY_COLORS = {
  high: 'bg-red-100 text-red-700',
  medium: 'bg-yellow-100 text-yellow-700',
  low: 'bg-blue-100 text-blue-600'
}

const DocsAIPanel = ({ type, data, onClose, onAction, loading }) => {
  if (!data && !loading) return null

  const renderSuggestions = () => {
    const { gaps = [], coverage_score, summary } = data || {}
    return (
      <div className="space-y-4">
        {/* Coverage overview */}
        {(coverage_score !== undefined || summary) && (
          <div className="bg-gray-50 rounded-lg p-4">
            {coverage_score !== undefined && (
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm text-gray-500">Coverage Score</span>
                <span className={`text-2xl font-bold ${
                  coverage_score >= 70 ? 'text-green-600' :
                  coverage_score >= 40 ? 'text-yellow-600' : 'text-red-600'
                }`}>{coverage_score}%</span>
              </div>
            )}
            {summary && <p className="text-sm text-gray-600">{summary}</p>}
          </div>
        )}

        {/* Gap list */}
        {gaps.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            <CheckCircleIcon className="w-8 h-8 mx-auto mb-2 text-green-500" />
            <p>No documentation gaps found.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {gaps.map((gap, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium text-gray-900">{gap.topic}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[gap.priority] || PRIORITY_COLORS.medium}`}>
                        {gap.priority}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500">{gap.reason}</p>
                    <div className="flex items-center gap-2 mt-2">
                      {gap.suggested_category && (
                        <span className="text-xs text-gray-400">{gap.suggested_category}</span>
                      )}
                      {gap.target_roles?.length > 0 && (
                        <span className="text-xs text-gray-400">
                          {gap.target_roles.join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => onAction?.('generate', gap)}
                    className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 text-sm font-medium"
                  >
                    <SparklesIcon className="w-3.5 h-3.5" /> Generate
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const renderScaffold = () => {
    const { categories = [] } = data || {}
    return (
      <div className="space-y-4">
        {categories.length === 0 ? (
          <div className="text-center py-6 text-gray-500">
            No structure generated.
          </div>
        ) : (
          <>
            <div className="flex justify-end">
              <button
                onClick={() => onAction?.('create-all', { categories })}
                className="flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-optio-purple to-optio-pink text-white rounded-lg hover:opacity-90 text-sm font-medium"
              >
                <FolderPlusIcon className="w-4 h-4" /> Create All Categories
              </button>
            </div>
            {categories.map((cat, ci) => (
              <div key={ci} className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b">
                  <div>
                    <span className="font-medium text-gray-900">{cat.title}</span>
                    {cat.description && (
                      <p className="text-xs text-gray-500 mt-0.5">{cat.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => onAction?.('create-category', cat)}
                    className="px-3 py-1 text-xs font-medium text-optio-purple border border-optio-purple rounded-lg hover:bg-optio-purple hover:text-white transition-colors"
                  >
                    Create Category
                  </button>
                </div>
                {cat.articles?.length > 0 && (
                  <div className="divide-y">
                    {cat.articles.map((article, ai) => (
                      <div key={ai} className="flex items-center justify-between px-4 py-2.5 hover:bg-gray-50">
                        <div className="min-w-0 flex-1">
                          <span className="text-sm text-gray-900">{article.title}</span>
                          {article.summary && (
                            <p className="text-xs text-gray-400 mt-0.5 truncate">{article.summary}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0 ml-3">
                          {article.priority && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_COLORS[article.priority] || PRIORITY_COLORS.medium}`}>
                              {article.priority}
                            </span>
                          )}
                          <button
                            onClick={() => onAction?.('generate-from-scaffold', { ...article, category: cat.title })}
                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-optio-purple hover:bg-optio-purple/10 rounded transition-colors"
                          >
                            <SparklesIcon className="w-3 h-3" /> Generate
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </div>
    )
  }

  const renderUpdates = () => {
    const { needs_update, confidence, issues = [], summary } = data || {}
    return (
      <div className="space-y-4">
        {/* Status banner */}
        <div className={`rounded-lg p-4 ${needs_update ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'}`}>
          <div className="flex items-center gap-2">
            {needs_update ? (
              <ExclamationTriangleIcon className="w-5 h-5 text-yellow-600" />
            ) : (
              <CheckCircleIcon className="w-5 h-5 text-green-600" />
            )}
            <span className={`font-medium ${needs_update ? 'text-yellow-800' : 'text-green-800'}`}>
              {needs_update ? 'Updates Recommended' : 'Article is Up-to-Date'}
            </span>
            {confidence !== undefined && (
              <span className="text-xs text-gray-500 ml-auto">
                Confidence: {Math.round(confidence * 100)}%
              </span>
            )}
          </div>
          {summary && <p className="text-sm text-gray-600 mt-2">{summary}</p>}
        </div>

        {/* Issues list */}
        {issues.length > 0 && (
          <div className="space-y-2">
            {issues.map((issue, i) => (
              <div key={i} className="border border-gray-200 rounded-lg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[issue.severity] || SEVERITY_COLORS.medium}`}>
                        {issue.severity}
                      </span>
                      <span className="text-xs text-gray-400 capitalize">{issue.type}</span>
                    </div>
                    <p className="text-sm text-gray-900">{issue.description}</p>
                    {issue.suggested_fix && (
                      <p className="text-sm text-gray-500 mt-1">
                        <span className="font-medium">Fix:</span> {issue.suggested_fix}
                      </p>
                    )}
                  </div>
                  <button
                    onClick={() => onAction?.('apply-fix', issue)}
                    className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-optio-purple border border-optio-purple rounded-lg hover:bg-optio-purple hover:text-white transition-colors"
                  >
                    Apply Fix
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    )
  }

  const titles = {
    suggestions: 'Documentation Gap Analysis',
    scaffold: 'Docs Structure Scaffold',
    updates: 'Article Freshness Check'
  }

  return (
    <ModalOverlay onClose={onClose}>
      <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <SparklesIcon className="w-5 h-5 text-optio-purple" />
            <h2 className="font-semibold text-gray-900">{titles[type] || 'AI Results'}</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 rounded"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12">
              <ArrowPathIcon className="w-8 h-8 text-optio-purple animate-spin" />
              <p className="text-sm text-gray-500 mt-3">AI is analyzing...</p>
            </div>
          ) : (
            <>
              {type === 'suggestions' && renderSuggestions()}
              {type === 'scaffold' && renderScaffold()}
              {type === 'updates' && renderUpdates()}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end px-6 py-3 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
          >
            Close
          </button>
        </div>
      </div>
    </ModalOverlay>
  )
}

export default memo(DocsAIPanel)
