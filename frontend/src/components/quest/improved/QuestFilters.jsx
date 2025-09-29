import React, { useState, memo } from 'react';

const QuestFilters = ({
  searchTerm,
  onSearchChange,
  selectedPillar,
  onPillarChange,
  selectedDifficulty,
  onDifficultyChange,
  selectedSubject,
  onSubjectChange,
  sortBy,
  onSortChange,
  viewMode,
  onViewModeChange,
  totalResults
}) => {
  const [filtersOpen, setFiltersOpen] = useState(false);

  const pillars = [
    { value: 'all', label: 'All Skills', color: 'bg-gray-600 text-white' },
    { value: 'stem_logic', label: 'STEM & Logic', color: 'bg-blue-500 text-white' },
    { value: 'life_wellness', label: 'Life & Wellness', color: 'bg-red-500 text-white' },
    { value: 'language_communication', label: 'Language & Communication', color: 'bg-green-500 text-white' },
    { value: 'society_culture', label: 'Society & Culture', color: 'bg-orange-500 text-white' },
    { value: 'arts_creativity', label: 'Arts & Creativity', color: 'bg-purple-500 text-white' }
  ];

  const difficulties = [
    { value: 'all', label: 'All Levels' },
    { value: 'beginner', label: 'Beginner', color: 'bg-green-100 text-green-700' },
    { value: 'intermediate', label: 'Intermediate', color: 'bg-yellow-100 text-yellow-700' },
    { value: 'advanced', label: 'Advanced', color: 'bg-red-100 text-red-700' }
  ];

  const subjects = [
    { value: 'all', label: 'All Subjects' },
    { value: 'language_arts', label: 'Language Arts' },
    { value: 'math', label: 'Math' },
    { value: 'science', label: 'Science' },
    { value: 'social_studies', label: 'Social Studies' },
    { value: 'financial_literacy', label: 'Financial Literacy' },
    { value: 'health', label: 'Health' },
    { value: 'pe', label: 'PE' },
    { value: 'fine_arts', label: 'Fine Arts' },
    { value: 'cte', label: 'CTE' },
    { value: 'digital_literacy', label: 'Digital Literacy' },
    { value: 'electives', label: 'Electives' }
  ];

  const sortOptions = [
    { value: 'newest', label: 'Newest First' },
    { value: 'popular', label: 'Most Popular' },
    { value: 'xp_high', label: 'Highest XP' },
    { value: 'xp_low', label: 'Lowest XP' },
    { value: 'alphabetical', label: 'A-Z' }
  ];

  // Count active filters
  const activeFilterCount = [
    selectedPillar !== 'all' ? 1 : 0,
    selectedDifficulty !== 'all' ? 1 : 0,
    selectedSubject !== 'all' ? 1 : 0
  ].reduce((sum, count) => sum + count, 0);

  const handleClearAllFilters = () => {
    onPillarChange('all');
    onDifficultyChange('all');
    onSubjectChange('all');
  };

  return (
    <div className="space-y-3">
      {/* Main Toolbar - Clean and Simple */}
      <div className="flex gap-3 items-center">
        {/* Search Input */}
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search quests by title or description..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-gray-200 focus:border-[#6d469b] focus:ring-2 focus:ring-[#6d469b]/20 transition-all"
          />
          <svg
            className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Filters Button with Badge */}
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className={`relative flex items-center gap-2 px-4 py-3 rounded-xl border font-medium transition-all ${
            filtersOpen
              ? 'bg-[#6d469b] text-white border-[#6d469b]'
              : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
          }`}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span>Filters</span>
          {activeFilterCount > 0 && (
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>

        {/* Sort Dropdown */}
        <div className="relative">
          <select
            value={sortBy || 'newest'}
            onChange={(e) => onSortChange && onSortChange(e.target.value)}
            className="appearance-none bg-white border border-gray-200 rounded-xl px-4 py-3 pr-10 focus:border-[#6d469b] focus:ring-2 focus:ring-[#6d469b]/20 transition-all font-medium text-gray-700"
          >
            {sortOptions.map(option => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <svg
            className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {/* View Mode Toggle */}
        {onViewModeChange && (
          <div className="flex border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => onViewModeChange('grid')}
              className={`px-3 py-3 transition-all ${
                viewMode === 'grid'
                  ? 'bg-[#6d469b] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              title="Grid View"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => onViewModeChange('list')}
              className={`px-3 py-3 transition-all ${
                viewMode === 'list'
                  ? 'bg-[#6d469b] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              title="List View"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* Active Filter Chips */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-600 font-medium">Active filters:</span>

          {selectedPillar !== 'all' && (
            <button
              onClick={() => onPillarChange('all')}
              className="inline-flex items-center gap-1 px-3 py-1 bg-[#6d469b]/10 text-[#6d469b] rounded-full text-sm font-medium hover:bg-[#6d469b]/20 transition-colors"
            >
              {pillars.find(p => p.value === selectedPillar)?.label}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {selectedDifficulty !== 'all' && (
            <button
              onClick={() => onDifficultyChange('all')}
              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium hover:bg-blue-200 transition-colors"
            >
              {difficulties.find(d => d.value === selectedDifficulty)?.label}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          {selectedSubject !== 'all' && (
            <button
              onClick={() => onSubjectChange('all')}
              className="inline-flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium hover:bg-green-200 transition-colors"
            >
              {subjects.find(s => s.value === selectedSubject)?.label}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}

          <button
            onClick={handleClearAllFilters}
            className="text-sm text-gray-500 hover:text-gray-700 font-medium"
          >
            Clear all
          </button>
        </div>
      )}

      {/* Results Count */}
      {totalResults !== undefined && (
        <div className="text-sm text-gray-500">
          {totalResults} {totalResults === 1 ? 'quest' : 'quests'} found
        </div>
      )}

      {/* Collapsible Filter Panel */}
      {filtersOpen && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm animate-slideDown">
          <FilterContent
            pillars={pillars}
            selectedPillar={selectedPillar}
            onPillarChange={onPillarChange}
            difficulties={difficulties}
            selectedDifficulty={selectedDifficulty}
            onDifficultyChange={onDifficultyChange}
            subjects={subjects}
            selectedSubject={selectedSubject}
            onSubjectChange={onSubjectChange}
          />
        </div>
      )}
    </div>
  );
};

// Separate component for filter content to avoid duplication
const FilterContent = memo(({
  pillars,
  selectedPillar,
  onPillarChange,
  difficulties,
  selectedDifficulty,
  onDifficultyChange,
  subjects,
  selectedSubject,
  onSubjectChange
}) => {
  return (
    <div className="space-y-6">
      {/* Skill Pillars */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Skill Area</h3>
        <div className="flex flex-wrap gap-2">
          {pillars.map(pillar => (
            <button
              key={pillar.value}
              onClick={() => onPillarChange(pillar.value)}
              className={`
                px-4 py-2 rounded-lg font-medium transition-all
                ${selectedPillar === pillar.value
                  ? `${pillar.color} shadow-md`
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {pillar.label}
            </button>
          ))}
        </div>
      </div>

      {/* School Subjects */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Diploma Credit</h3>
        <div className="flex flex-wrap gap-2">
          {subjects.map(subject => (
            <button
              key={subject.value}
              onClick={() => onSubjectChange(subject.value)}
              className={`
                px-4 py-2 rounded-lg font-medium transition-all
                ${selectedSubject === subject.value
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {subject.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default memo(QuestFilters);