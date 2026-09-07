// Step 1: how this student wants their quest built -- let the AI propose tasks,
// follow one of the quest's curated paths, or write the tasks themselves.
import React from 'react';
import { MapIcon } from '@heroicons/react/24/outline';

const ChooseMethodStep = ({
  canUseTaskGeneration, embedded, hasPaths, loading, questTitle,
  setCreationMethod, setError, setStep, startSession, step1GridCols, sz,
}) => (
  <div className="text-center">
    <h2 className={sz.heading}>
      How would you like to create tasks?
    </h2>
    <p className={sz.subheading}>
      Choose how you want to build your quest for "{questTitle}"
    </p>

    <div className={`grid ${step1GridCols} ${embedded ? 'gap-3 mb-3' : 'gap-6 mb-6'} max-w-3xl mx-auto`}>
      {/* AI Generation Option */}
      {canUseTaskGeneration && (
        <button
          onClick={() => startSession('ai')}
          disabled={loading}
          className={`group border-2 border-gray-300 hover:border-optio-purple transition-all text-left disabled:opacity-50 min-h-[44px] ${
            embedded
              ? 'p-3 rounded-lg flex items-center gap-3 hover:shadow-md'
              : 'p-6 sm:p-8 rounded-xl hover:shadow-xl'
          }`}
        >
          <div className={embedded ? 'text-2xl shrink-0' : 'text-4xl sm:text-5xl mb-4'}>✨</div>
          <div>
            <h3 className={`${embedded ? 'text-base font-bold' : 'text-xl sm:text-2xl font-bold mb-2'} group-hover:text-optio-purple transition-colors`}>
              AI Generate
            </h3>
            <p className={embedded ? 'text-xs text-gray-600' : 'text-sm sm:text-base text-gray-600'}>
              Let AI create personalized tasks based on your interests and learning style
            </p>
          </div>
        </button>
      )}

      {/* Choose a Path Option — only when the quest ships curated paths */}
      {hasPaths && (
        <button
          onClick={() => {
            setError(null);
            setCreationMethod('path');
            setStep(5);
          }}
          disabled={loading}
          className={`group border-2 border-gray-300 hover:border-blue-500 transition-all text-left disabled:opacity-50 min-h-[44px] ${
            embedded
              ? 'p-3 rounded-lg flex items-center gap-3 hover:shadow-md'
              : 'p-6 sm:p-8 rounded-xl hover:shadow-xl'
          }`}
        >
          <div className={embedded ? 'shrink-0' : 'mb-4'}>
            <MapIcon className={`text-blue-500 ${embedded ? 'w-7 h-7' : 'w-10 h-10 sm:w-12 sm:h-12'}`} />
          </div>
          <div>
            <h3 className={`${embedded ? 'text-base font-bold' : 'text-xl sm:text-2xl font-bold mb-2'} group-hover:text-blue-600 transition-colors`}>
              Choose a Path
            </h3>
            <p className={embedded ? 'text-xs text-gray-600' : 'text-sm sm:text-base text-gray-600'}>
              Start from a ready-made set of tasks you can customize
            </p>
          </div>
        </button>
      )}

      {/* Manual Creation Option */}
      <button
        onClick={() => startSession('manual')}
        disabled={loading}
        className={`group border-2 border-gray-300 hover:border-optio-pink transition-all text-left disabled:opacity-50 min-h-[44px] ${
          embedded
            ? 'p-3 rounded-lg flex items-center gap-3 hover:shadow-md'
            : 'p-6 sm:p-8 rounded-xl hover:shadow-xl'
        }`}
      >
        <div className={embedded ? 'text-2xl shrink-0' : 'text-4xl sm:text-5xl mb-4'}>✍️</div>
        <div>
          <h3 className={`${embedded ? 'text-base font-bold' : 'text-xl sm:text-2xl font-bold mb-2'} group-hover:text-optio-pink transition-colors`}>
            Write My Own
          </h3>
          <p className={embedded ? 'text-xs text-gray-600' : 'text-sm sm:text-base text-gray-600'}>
            Create custom tasks based on your own ideas and interests
          </p>
        </div>
      </button>
    </div>

    {loading && (
      <p className="text-sm text-gray-500">
        Starting...
      </p>
    )}
  </div>
);

export default ChooseMethodStep;
