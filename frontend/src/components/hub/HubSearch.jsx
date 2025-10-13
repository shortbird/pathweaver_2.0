import React from 'react';
import { Search, X } from 'lucide-react';

/**
 * HubSearch Component
 * Search input with Optio gradient accent styling
 * Matches mockup design with clean search interface
 */
export default function HubSearch({ value, onChange, placeholder = "Search..." }) {
  const handleClear = () => {
    onChange('');
  };

  return (
    <div className="relative">
      <div className="relative flex items-center">
        <div className="absolute left-3 pointer-events-none">
          <Search className="w-5 h-5 text-gray-400" />
        </div>

        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="
            w-full pl-10 pr-10 py-3
            border-2 border-gray-200 rounded-lg
            focus:outline-none focus:border-transparent
            focus:ring-2 focus:ring-[#ef597b]
            transition-all duration-200
            text-gray-700 placeholder-gray-400
          "
        />

        {value && (
          <button
            onClick={handleClear}
            className="absolute right-3 p-1 rounded-full hover:bg-gray-100 transition-colors"
            aria-label="Clear search"
          >
            <X className="w-4 h-4 text-gray-500" />
          </button>
        )}
      </div>

      {/* Gradient accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-[#ef597b] to-[#6d469b] opacity-0 group-focus-within:opacity-100 transition-opacity duration-200" />
    </div>
  );
}
