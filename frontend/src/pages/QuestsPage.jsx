import React, { useState, useEffect } from 'react'
import api from '../services/api'
import QuestCard from '../components/QuestCard'

const QuestsPage = () => {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedSubject, setSelectedSubject] = useState('')
  const [page, setPage] = useState(1)

  const subjects = [
    { value: '', label: 'All Subjects' },
    { value: 'language_arts', label: 'Language Arts' },
    { value: 'math', label: 'Math' },
    { value: 'science', label: 'Science' },
    { value: 'social_studies', label: 'Social Studies' },
    { value: 'foreign_language', label: 'Foreign Language' },
    { value: 'arts', label: 'Arts' },
    { value: 'technology', label: 'Technology' },
    { value: 'physical_education', label: 'Physical Education' }
  ]

  useEffect(() => {
    fetchQuests()
  }, [page, search, selectedSubject])

  const fetchQuests = async () => {
    setLoading(true)
    try {
      const params = {
        page,
        per_page: 12,
        search,
        subject: selectedSubject
      }
      const response = await api.get('/quests', { params })
      setQuests(response.data.quests)
    } catch (error) {
      console.error('Failed to fetch quests:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    fetchQuests()
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">Quest Library</h1>
        <p className="text-gray-600">
          Explore our collection of engaging quests designed to turn your interests into learning opportunities.
        </p>
      </div>

      <div className="mb-8 bg-white rounded-xl p-6 shadow-sm">
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <input
              type="text"
              placeholder="Search quests..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input-field w-full"
            />
          </div>
          <div className="md:w-64">
            <select
              value={selectedSubject}
              onChange={(e) => {
                setSelectedSubject(e.target.value)
                setPage(1)
              }}
              className="input-field w-full"
            >
              {subjects.map(subject => (
                <option key={subject.value} value={subject.value}>
                  {subject.label}
                </option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn-primary">
            Search
          </button>
        </form>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      ) : (
        <>
          {quests.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {quests.map(quest => (
                <QuestCard key={quest.id} quest={quest} />
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600">No quests found. Try adjusting your search criteria.</p>
            </div>
          )}

          {quests.length === 12 && (
            <div className="mt-8 flex justify-center gap-4">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="flex items-center px-4">Page {page}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                className="btn-primary"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default QuestsPage