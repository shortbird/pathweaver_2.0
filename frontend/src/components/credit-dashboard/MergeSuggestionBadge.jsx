import React, { useState, useEffect } from 'react'
import api from '../../services/api'

const MergeSuggestionBadge = ({ studentId }) => {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!studentId) return
    const fetch = async () => {
      try {
        setLoading(true)
        const res = await api.get(`/api/credit-dashboard/suggest-merges/${studentId}`)
        const data = res.data?.data || res.data
        setSuggestions(data.suggestions || [])
      } catch (err) {
        // Silently fail - AI suggestions are optional
      } finally {
        setLoading(false)
      }
    }
    fetch()
  }, [studentId])

  if (loading || suggestions.length === 0) return null

  return (
    <div>
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-xs px-2 py-1 bg-amber-100 text-amber-800 rounded-full hover:bg-amber-200"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        {suggestions.length} possible duplicate{suggestions.length > 1 ? 's' : ''} detected
      </button>

      {expanded && (
        <div className="mt-2 space-y-2">
          {suggestions.map((group, i) => (
            <div key={i} className="text-xs p-2 bg-amber-50 rounded border border-amber-200">
              <p className="font-medium text-amber-800">
                {group.completion_ids.length} similar tasks ({Math.round(group.confidence * 100)}% confidence)
              </p>
              <p className="text-amber-600 mt-0.5">{group.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default MergeSuggestionBadge
