import React from 'react';
import { Link } from 'react-router-dom';
import Button from '../ui/Button';

export const EmptyQuestsState = () => (
  <div className="text-center py-8 sm:py-12 px-4 bg-gradient-to-br from-purple-50 to-pink-50 rounded-xl border border-purple-200">
    <div className="mb-4 sm:mb-6">
      <svg className="mx-auto h-16 sm:h-24 w-16 sm:w-24 text-purple-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
      </svg>
    </div>
    <h3 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
      Choose Your Next Adventure
    </h3>
    <p className="text-sm sm:text-base text-gray-600 mb-4 sm:mb-6 max-w-md mx-auto">
      Pick something that sparks your curiosity. Every quest is a chance to discover what you're capable of.
    </p>
    <Link to="/quests">
      <Button variant="primary" size="lg" className="min-h-[44px]">
        <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        Browse Quests
      </Button>
    </Link>
    <div className="mt-4 sm:mt-6 flex flex-col sm:flex-row justify-center gap-4 sm:gap-8 text-sm">
      <div className="flex items-center justify-center gap-2 text-gray-600">
        <svg className="w-5 h-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
        </svg>
        <span>Learn at your own pace</span>
      </div>
      <div className="flex items-center justify-center gap-2 text-gray-600">
        <svg className="w-5 h-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
          <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18v-3a5.972 5.972 0 00-.75-2.906A3.005 3.005 0 0119 15v3h-3zM4.75 12.094A5.973 5.973 0 004 15v3H1v-3a3 3 0 013.75-2.906z" />
        </svg>
        <span>Learn alongside friends</span>
      </div>
    </div>
  </div>
);

export const EmptyAchievementsState = () => (
  <div className="text-center py-6 sm:py-8 px-4 bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl border border-green-200">
    <div className="mb-4">
      <svg className="mx-auto h-12 sm:h-16 w-12 sm:w-16 text-green-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
      </svg>
    </div>
    <h3 className="text-base sm:text-lg font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
      Your Achievements Will Grow Here
    </h3>
    <p className="text-sm sm:text-base text-gray-600 mb-4">
      As you complete quests, you'll discover new skills and celebrate your growth!
    </p>
    <Link to="/quests">
      <Button variant="outline" size="sm" className="min-h-[44px]">
        Start a Quest
      </Button>
    </Link>
  </div>
);

export const EmptySkillsState = () => (
  <div className="flex flex-col items-center justify-center min-h-[200px] sm:h-64 text-center px-4 py-6">
    <div className="mb-4">
      <svg className="mx-auto h-16 sm:h-20 w-16 sm:w-20 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    </div>
    <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-2" style={{ fontFamily: 'Poppins, sans-serif' }}>
      Your Skills Are Waiting to Bloom
    </h3>
    <p className="text-sm sm:text-base text-gray-600 mb-4 max-w-sm">
      As you explore quests, you'll discover your strengths across different areas!
    </p>
    <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3 mt-4">
      {['Creativity', 'Critical Thinking', 'Practical Skills', 'Communication', 'Cultural Literacy'].map((skill, idx) => (
        <div key={idx} className="text-center">
          <div className="w-10 sm:w-12 h-10 sm:h-12 rounded-full bg-gray-100 mx-auto mb-1" />
          <p className="text-xs text-gray-500 truncate">{skill.split(' ')[0]}</p>
        </div>
      ))}
    </div>
  </div>
);

export const EmptyRecentTasksState = () => (
  <div className="text-center py-6 px-4 bg-gray-50 rounded-lg">
    <svg className="mx-auto h-10 sm:h-12 w-10 sm:w-12 text-gray-400 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
    <p className="text-gray-600 text-sm">No completed tasks yet</p>
    <p className="text-xs text-gray-500 mt-1">Your recent completions will appear here</p>
  </div>
);