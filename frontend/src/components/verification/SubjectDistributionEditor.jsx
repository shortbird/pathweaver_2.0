import React from 'react';

const DIPLOMA_SUBJECTS = [
  { key: 'english', label: 'English', color: 'bg-blue-500' },
  { key: 'math', label: 'Mathematics', color: 'bg-green-500' },
  { key: 'science', label: 'Science', color: 'bg-purple-500' },
  { key: 'social_studies', label: 'Social Studies', color: 'bg-yellow-500' },
  { key: 'arts', label: 'Arts', color: 'bg-pink-500' },
  { key: 'physical_education', label: 'Physical Education', color: 'bg-red-500' },
  { key: 'other', label: 'Other', color: 'bg-gray-500' }
];

export default function SubjectDistributionEditor({ distribution, onChange, showAIProposal = false, aiProposal = null }) {
  const handleSliderChange = (subjectKey, value) => {
    const newDistribution = {
      ...distribution,
      [subjectKey]: parseInt(value)
    };
    onChange(newDistribution);
  };

  const getTotalPercentage = () => {
    return Object.values(distribution).reduce((sum, val) => sum + (val || 0), 0);
  };

  const totalPercentage = getTotalPercentage();
  const isValid = totalPercentage === 100;

  return (
    <div className="space-y-4">
      {showAIProposal && aiProposal && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <div className="font-medium text-blue-900 mb-1">AI Proposed Distribution</div>
              <div className="text-blue-700 flex flex-wrap gap-2">
                {DIPLOMA_SUBJECTS.map(subject => {
                  const percentage = aiProposal[subject.key] || 0;
                  if (percentage === 0) return null;
                  return (
                    <span key={subject.key} className="text-xs bg-white px-2 py-1 rounded">
                      {subject.label}: {percentage}%
                    </span>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {DIPLOMA_SUBJECTS.map(subject => {
          const percentage = distribution[subject.key] || 0;
          const aiPercentage = aiProposal?.[subject.key] || 0;

          return (
            <div key={subject.key}>
              <div className="flex items-center justify-between mb-1">
                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <span className={`w-3 h-3 rounded-full ${subject.color}`}></span>
                  {subject.label}
                </label>
                <div className="flex items-center gap-2">
                  {showAIProposal && aiPercentage > 0 && aiPercentage !== percentage && (
                    <span className="text-xs text-gray-500">AI: {aiPercentage}%</span>
                  )}
                  <span className="text-sm font-semibold text-gray-900 w-12 text-right">
                    {percentage}%
                  </span>
                </div>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={percentage}
                onChange={(e) => handleSliderChange(subject.key, e.target.value)}
                className="w-full h-2 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, ${subject.color.replace('bg-', 'rgb(var(--color-')})) 0%, ${subject.color.replace('bg-', 'rgb(var(--color-')})) ${percentage}%, #e5e7eb ${percentage}%, #e5e7eb 100%)`
                }}
              />
            </div>
          );
        })}
      </div>

      <div className={`flex items-center justify-between p-3 rounded-lg border-2 ${isValid ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'}`}>
        <span className="text-sm font-medium">Total Distribution</span>
        <span className={`text-lg font-bold ${isValid ? 'text-green-700' : 'text-red-700'}`}>
          {totalPercentage}%
        </span>
      </div>

      {!isValid && (
        <div className="text-sm text-red-600 flex items-start gap-2">
          <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span>Total must equal 100%. Current total: {totalPercentage}%</span>
        </div>
      )}
    </div>
  );
}
