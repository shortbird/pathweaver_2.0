import React, { useState } from 'react';

/**
 * Collapsible section wrapper component for overview pages
 * Provides consistent expand/collapse UI pattern across overview sections
 */
const CollapsibleSection = ({ title, icon, children, defaultOpen = true, id }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section id={id} className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between p-6 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            {title}
          </h2>
        </div>
        <svg
          className={`w-5 h-5 text-gray-500 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div className={`transition-all duration-300 ${isOpen ? 'max-h-[5000px] opacity-100' : 'max-h-0 opacity-0 overflow-hidden'}`}>
        <div className="px-6 pb-6">
          {children}
        </div>
      </div>
    </section>
  );
};

export default CollapsibleSection;
