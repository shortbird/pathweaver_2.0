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
  totalResults 
}) => {
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const pillars = [
    { value: 'all', label: 'All Skills', color: 'from-gray-600 to-gray-700' },
    { value: 'stem_logic', label: 'STEM & Logic', color: 'from-blue-500 to-cyan-500' },
    { value: 'life_wellness', label: 'Life & Wellness', color: 'from-green-500 to-emerald-500' },
    { value: 'language_communication', label: 'Language & Communication', color: 'from-orange-500 to-yellow-500' },
    { value: 'society_culture', label: 'Society & Culture', color: 'from-red-500 to-rose-500' },
    { value: 'arts_creativity', label: 'Arts & Creativity', color: 'from-purple-500 to-pink-500' }
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

  return (
    <div className="mb-8">
      {/* Search Bar with Results Count */}
      <div className="mb-4">
        <div className="relative">
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
          {totalResults !== undefined && (
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-gray-500">
              {totalResults} {totalResults === 1 ? 'quest' : 'quests'} found
            </span>
          )}
        </div>
      </div>

      {/* Mobile Filter Toggle */}
      <button
        onClick={() => setMobileFiltersOpen(!mobileFiltersOpen)}
        className="md:hidden w-full mb-4 px-4 py-3 bg-white border border-gray-200 rounded-xl flex items-center justify-between hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
          </svg>
          <span className="font-medium text-gray-700">Filters</span>
        </div>
        <svg 
          className={`w-5 h-5 text-gray-400 transition-transform ${mobileFiltersOpen ? 'rotate-180' : ''}`} 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Desktop Filters (always visible) */}
      <div className="hidden md:block bg-white rounded-xl border border-gray-200 p-6">
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

      {/* Mobile Filters (collapsible) */}
      {mobileFiltersOpen && (
        <div className="md:hidden bg-white rounded-xl border border-gray-200 p-4 animate-slideDown">
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
            mobile={true}
          />
        </div>
      )}

      {/* Active Filter Chips */}
      {(selectedPillar !== 'all' || selectedDifficulty !== 'all' || selectedSubject !== 'all') && (
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="text-sm text-gray-600">Active filters:</span>
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
              className="inline-flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-700 rounded-full text-sm font-medium hover:bg-gray-200 transition-colors"
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
              className="inline-flex items-center gap-1 px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm font-medium hover:bg-blue-200 transition-colors"
            >
              📚 {subjects.find(s => s.value === selectedSubject)?.label}
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
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
  onSubjectChange,
  mobile = false 
}) => {
  const buttonClass = mobile ? 'text-sm' : '';

  return (
    <div className={`${mobile ? 'space-y-4' : 'space-y-6'}`}>
      {/* Skill Pillars */}
      <div>
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Skill Area</h3>
        <div className={`${mobile ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}`}>
          {pillars.map(pillar => (
            <button
              key={pillar.value}
              onClick={() => onPillarChange(pillar.value)}
              className={`
                ${mobile ? 'px-3 py-2' : 'px-4 py-2'} 
                rounded-lg font-medium transition-all ${buttonClass}
                ${selectedPillar === pillar.value 
                  ? pillar.color 
                    ? `bg-gradient-to-r ${pillar.color} text-white shadow-md` 
                    : 'bg-gray-900 text-white'
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
        <h3 className="text-sm font-semibold text-gray-700 mb-3">School Subject</h3>
        <div className={`${mobile ? 'grid grid-cols-2 gap-2' : 'flex flex-wrap gap-2'}`}>
          {subjects.map(subject => (
            <button
              key={subject.value}
              onClick={() => onSubjectChange(subject.value)}
              className={`
                ${mobile ? 'px-3 py-2' : 'px-4 py-2'} 
                rounded-lg font-medium transition-all ${buttonClass}
                ${selectedSubject === subject.value 
                  ? 'bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }
              `}
            >
              {subject.value === 'all' ? subject.label : `📚 ${subject.label}`}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default memo(QuestFilters);