import React, { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/24/outline'
import api from '../../services/api'

const DocsSearch = ({ large = false }) => {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(false)
  const inputRef = useRef(null)
  const dropdownRef = useRef(null)
  const debounceRef = useRef(null)
  const navigate = useNavigate()

  // Close dropdown on click outside
  useEffect(() => {
    const handleClick = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
          inputRef.current && !inputRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const doSearch = useCallback(async (q) => {
    if (!q || q.length < 2) {
      setResults([])
      setShowDropdown(false)
      return
    }

    setLoading(true)
    try {
      const res = await api.get(`/api/public/docs/search?q=${encodeURIComponent(q)}`)
      setResults(res.data.results || [])
      setShowDropdown(true)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }, [])

  const handleChange = (e) => {
    const val = e.target.value
    setQuery(val)

    // Debounce 300ms
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(val), 300)
  }

  const handleSelect = (result) => {
    const catSlug = result.category?.slug || 'article'
    navigate(`/docs/${catSlug}/${result.slug}`)
    setShowDropdown(false)
    setQuery('')
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setShowDropdown(false)
      inputRef.current?.blur()
    }
  }

  const clear = () => {
    setQuery('')
    setResults([])
    setShowDropdown(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative w-full">
      <div className="relative">
        <MagnifyingGlassIcon className={`absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 ${large ? 'w-6 h-6' : 'w-5 h-5'}`} />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search documentation..."
          className={`w-full border border-gray-300 rounded-xl bg-white focus:ring-2 focus:ring-optio-purple focus:border-optio-purple transition-shadow ${
            large
              ? 'pl-12 pr-12 py-4 text-lg shadow-lg'
              : 'pl-10 pr-10 py-2.5 text-sm'
          }`}
        />
        {query && (
          <button onClick={clear} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            <XMarkIcon className={large ? 'w-6 h-6' : 'w-5 h-5'} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-2 w-full bg-white rounded-xl shadow-xl border border-gray-200 max-h-80 overflow-y-auto"
        >
          {loading && (
            <div className="px-4 py-3 text-sm text-gray-500">Searching...</div>
          )}

          {!loading && results.length === 0 && query.length >= 2 && (
            <div className="px-4 py-3 text-sm text-gray-500">
              No results found for "{query}"
            </div>
          )}

          {results.map(result => (
            <button
              key={result.id}
              onClick={() => handleSelect(result)}
              className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b border-gray-100 last:border-0 transition-colors"
            >
              <div className="font-medium text-gray-900 text-sm">{result.title}</div>
              {result.summary && (
                <div className="text-xs text-gray-500 mt-0.5 line-clamp-1">{result.summary}</div>
              )}
              {result.category && (
                <div className="text-xs text-optio-purple mt-0.5">{result.category.title}</div>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default DocsSearch
