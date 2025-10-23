import React from 'react'
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline'

const ConnectionSearch = ({ searchQuery, onSearchChange, onAddConnection }) => {
  return (
    <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center mb-8">
      {/* Search Input */}
      <div className="relative flex-1">
        <MagnifyingGlassIcon
          className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400"
          aria-hidden="true"
        />
        <input
          type="text"
          placeholder="Find learning partners by name or interest..."
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          className="w-full pl-12 pr-4 py-3 rounded-[30px] border-2 border-[#EEEBEF] focus:border-transparent focus:outline-none focus:ring-2 transition-all"
          style={{
            fontFamily: 'Poppins',
            fontWeight: 500,
            boxShadow: 'inset 0 0 0 2px transparent',
          }}
          onFocus={(e) => {
            e.target.style.boxShadow = 'inset 0 0 0 2px transparent'
            e.target.style.borderImage = 'linear-gradient(90deg, #6D469B 0%, #EF597B 100%) 1'
          }}
          onBlur={(e) => {
            e.target.style.boxShadow = 'none'
            e.target.style.borderImage = 'none'
          }}
          aria-label="Search connections"
        />
      </div>

      {/* Add Connection Button */}
      <button
        onClick={onAddConnection}
        className="bg-gradient-primary text-white px-6 py-3 rounded-full font-semibold shadow-[0_4px_20px_rgba(109,70,155,0.15)] hover:shadow-[0_6px_25px_rgba(109,70,155,0.25)] hover:-translate-y-0.5 transition-all duration-300 whitespace-nowrap"
        style={{ fontFamily: 'Poppins', fontWeight: 600 }}
      >
        + Add Connection
      </button>
    </div>
  )
}

export default ConnectionSearch
