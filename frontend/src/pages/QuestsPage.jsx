import React, { useState, useEffect } from 'react'
import api from '../services/api'
import QuestCard from '../components/QuestCard'

const QuestsPage = () => {
  const [quests, setQuests] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [selectedSkillCategory, setSelectedSkillCategory] = useState('')
  const [selectedDifficulty, setSelectedDifficulty] = useState('')
  const [selectedEffortLevel, setSelectedEffortLevel] = useState('')
  const [selectedCoreSkill, setSelectedCoreSkill] = useState('')
  const [minHours, setMinHours] = useState('')
  const [maxHours, setMaxHours] = useState('')
  const [adultSupervision, setAdultSupervision] = useState('')
  const [showFilters, setShowFilters] = useState(false)
  const [filterOptions, setFilterOptions] = useState({
    skill_categories: [],
    difficulty_levels: [],
    effort_levels: [],
    core_skills: []
  })
  const [page, setPage] = useState(1)

  useEffect(() => {
    fetchFilterOptions()
  }, [])

  useEffect(() => {
    fetchQuests()
  }, [page, selectedSkillCategory, selectedDifficulty, selectedEffortLevel, selectedCoreSkill, minHours, maxHours, adultSupervision])

  const fetchFilterOptions = async () => {
    try {
      const response = await api.get('/quests/filter-options')
      setFilterOptions(response.data)
    } catch (error) {
      console.error('Failed to fetch filter options:', error)
    }
  }

  const fetchQuests = async () => {
    setLoading(true)
    try {
      const params = {
        page,
        per_page: 12,
        search
      }
      
      if (selectedSkillCategory) params.skill_category = selectedSkillCategory
      if (selectedDifficulty) params.difficulty = selectedDifficulty
      if (selectedEffortLevel) params.effort_level = selectedEffortLevel
      if (selectedCoreSkill) params.core_skill = selectedCoreSkill
      if (minHours) params.min_hours = minHours
      if (maxHours) params.max_hours = maxHours
      if (adultSupervision) params.adult_supervision = adultSupervision
      
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

  const clearFilters = () => {
    setSearch('')
    setSelectedSkillCategory('')
    setSelectedDifficulty('')
    setSelectedEffortLevel('')
    setSelectedCoreSkill('')
    setMinHours('')
    setMaxHours('')
    setAdultSupervision('')
    setPage(1)
  }

  const activeFiltersCount = () => {
    let count = 0
    if (selectedSkillCategory) count++
    if (selectedDifficulty) count++
    if (selectedEffortLevel) count++
    if (selectedCoreSkill) count++
    if (minHours) count++
    if (maxHours) count++
    if (adultSupervision) count++
    return count
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
        <form onSubmit={handleSearch} className="space-y-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <input
                type="text"
                placeholder="Search by title or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input-field w-full"
              />
            </div>
            <button type="submit" className="btn-primary">
              Search
            </button>
            <button
              type="button"
              onClick={() => setShowFilters(!showFilters)}
              className="btn-secondary flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              Filters
              {activeFiltersCount() > 0 && (
                <span className="bg-primary text-white text-xs px-2 py-0.5 rounded-full">
                  {activeFiltersCount()}
                </span>
              )}
            </button>
          </div>

          {showFilters && (
            <div className="border-t pt-4 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Skill Category
                  </label>
                  <select
                    value={selectedSkillCategory}
                    onChange={(e) => {
                      setSelectedSkillCategory(e.target.value)
                      setPage(1)
                    }}
                    className="input-field w-full"
                  >
                    <option value="">All Categories</option>
                    {filterOptions.skill_categories.map(category => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Difficulty Level
                  </label>
                  <select
                    value={selectedDifficulty}
                    onChange={(e) => {
                      setSelectedDifficulty(e.target.value)
                      setPage(1)
                    }}
                    className="input-field w-full"
                  >
                    <option value="">All Levels</option>
                    {filterOptions.difficulty_levels.map(level => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Effort Level
                  </label>
                  <select
                    value={selectedEffortLevel}
                    onChange={(e) => {
                      setSelectedEffortLevel(e.target.value)
                      setPage(1)
                    }}
                    className="input-field w-full"
                  >
                    <option value="">All Effort Levels</option>
                    {filterOptions.effort_levels.map(level => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Core Skill
                  </label>
                  <select
                    value={selectedCoreSkill}
                    onChange={(e) => {
                      setSelectedCoreSkill(e.target.value)
                      setPage(1)
                    }}
                    className="input-field w-full"
                  >
                    <option value="">All Skills</option>
                    {filterOptions.core_skills.map(skill => (
                      <option key={skill} value={skill}>
                        {skill.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Estimated Hours
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      placeholder="Min"
                      value={minHours}
                      onChange={(e) => {
                        setMinHours(e.target.value)
                        setPage(1)
                      }}
                      min="0"
                      className="input-field w-full"
                    />
                    <span className="flex items-center">-</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={maxHours}
                      onChange={(e) => {
                        setMaxHours(e.target.value)
                        setPage(1)
                      }}
                      min="0"
                      className="input-field w-full"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Adult Supervision
                  </label>
                  <select
                    value={adultSupervision}
                    onChange={(e) => {
                      setAdultSupervision(e.target.value)
                      setPage(1)
                    }}
                    className="input-field w-full"
                  >
                    <option value="">Any</option>
                    <option value="false">Solo Quest</option>
                    <option value="true">Adult Supervised</option>
                  </select>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm text-gray-600 hover:text-gray-900 underline"
                >
                  Clear all filters
                </button>
              </div>
            </div>
          )}
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