import React, { useState, useEffect, useRef } from 'react'
import api from '../services/api'

const SimilarQuestAutocomplete = ({
  searchTerm,
  onSelectQuest,
  onClose,
  isOpen
}) => {
  const [suggestions, setSuggestions] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const dropdownRef = useRef(null)

  // Debounced search effect
  useEffect(() => {
    if (!searchTerm || searchTerm.length < 3) {
      setSuggestions([])
      return
    }

    const timeoutId = setTimeout(async () => {
      setLoading(true)
      try {
        const response = await api.get('/api/quests/similar', {
          params: { search: searchTerm, limit: 10 }
        })
        if (response.data.success) {
          setSuggestions(response.data.quests || [])
        }
      } catch (error) {
        console.error('Error fetching similar quests:', error)
        setSuggestions([])
      } finally {
        setLoading(false)
      }
    }, 300) // 300ms debounce

    return () => clearTimeout(timeoutId)
  }, [searchTerm])

  // Reset selected index when suggestions change
  useEffect(() => {
    setSelectedIndex(-1)
  }, [suggestions])

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isOpen || suggestions.length === 0) return

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev < suggestions.length - 1 ? prev + 1 : 0
          )
          break
        case 'ArrowUp':
          e.preventDefault()
          setSelectedIndex(prev =>
            prev > 0 ? prev - 1 : suggestions.length - 1
          )
          break
        case 'Enter':
          e.preventDefault()
          if (selectedIndex >= 0 && suggestions[selectedIndex]) {
            onSelectQuest(suggestions[selectedIndex])
          }
          break
        case 'Escape':
          onClose()
          break
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, suggestions, selectedIndex, onSelectQuest, onClose])

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        onClose()
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [onClose])

  if (!isOpen || searchTerm.length < 3) {
    return null
  }

  return (
    <div
      ref={dropdownRef}
      className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto"
    >
      {loading ? (
        <div className="px-4 py-3 text-gray-500 text-sm flex items-center">
          <div className="animate-spin h-4 w-4 border-2 border-optio-purple border-t-transparent rounded-full mr-2" />
          Searching for similar quests...
        </div>
      ) : suggestions.length > 0 ? (
        <>
          <div className="px-4 py-2 bg-purple-50 border-b border-purple-100">
            <p className="text-sm text-purple-800 font-medium">
              Similar quests found ({suggestions.length})
            </p>
            <p className="text-xs text-purple-600">
              Click to use an existing quest instead of creating a new one
            </p>
          </div>
          <ul role="listbox">
            {suggestions.map((quest, index) => (
              <li
                key={quest.id}
                role="option"
                aria-selected={index === selectedIndex}
                className={`px-4 py-3 cursor-pointer border-b border-gray-100 last:border-0 transition-colors ${
                  index === selectedIndex
                    ? 'bg-purple-100'
                    : 'hover:bg-gray-50'
                }`}
                onClick={() => onSelectQuest(quest)}
              >
                <div className="flex items-start gap-3">
                  {quest.image_url && (
                    <img
                      src={quest.image_url}
                      alt=""
                      className="w-12 h-12 object-cover rounded flex-shrink-0"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {quest.title}
                    </p>
                    {quest.big_idea && (
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {quest.big_idea}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        quest.quest_type === 'course'
                          ? 'bg-blue-100 text-blue-700'
                          : 'bg-green-100 text-green-700'
                      }`}>
                        {quest.quest_type === 'course' ? 'Course Quest' : 'Optio Quest'}
                      </span>
                      {quest.is_public && (
                        <span className="text-xs px-2 py-0.5 rounded bg-gray-100 text-gray-600">
                          Public
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 bg-gray-50 border-t text-sm text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition-colors text-left flex items-center justify-between"
          >
            <span>Continue creating new quest</span>
            <span className="text-xs text-gray-400">Esc</span>
          </button>
        </>
      ) : (
        <div className="px-4 py-3 text-gray-500 text-sm">
          No similar quests found. You can create a new one.
        </div>
      )}
    </div>
  )
}

export default SimilarQuestAutocomplete
