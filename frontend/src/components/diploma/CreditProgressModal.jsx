import React from 'react';
import { getAllCreditProgress, calculateTotalCredits, TOTAL_CREDITS_REQUIRED, meetsGraduationRequirements } from '../../utils/creditRequirements';

const CreditProgressModal = ({ isOpen, onClose, subjectXP, isOwner, getStudentFirstName, onAccreditedDiplomaClick }) => {
  if (!isOpen) return null;

  // Memoize expensive credit calculations
  const creditProgress = getAllCreditProgress(subjectXP);
  const totalCreditsEarned = calculateTotalCredits(subjectXP);
  const meetsRequirements = meetsGraduationRequirements(subjectXP);

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50"
      onClick={onClose}
      role="button"
      tabIndex="0"
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClose();
        }
      }}
      aria-label="Close credit progress modal"
    >
      <div
        className="bg-white rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Credit Progress"
      >
        <div className="sticky top-0 p-6 bg-gradient-primary z-10">
          <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-white">Diploma Credits Breakdown</h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <div className="p-6">
          <div className="text-center mb-6">
            <p className="text-gray-600 mb-4">
              Progress toward an accredited high school diploma through evidence-based learning
            </p>
            <button
              onClick={onAccreditedDiplomaClick}
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-4 py-2 rounded-lg transition-all duration-200 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>How does this work?</span>
            </button>
          </div>

          {/* Total Credits Progress */}
          <div className="mb-8">
            <div className={`p-6 rounded-xl border-2 ${
              meetsRequirements
                ? 'bg-green-50 border-green-200'
                : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-800">Total Credits Progress</h3>
                  <p className="text-gray-600 text-sm">
                    {meetsRequirements
                      ? isOwner
                        ? 'Congratulations! You meet graduation requirements!'
                        : `${getStudentFirstName()} meets graduation requirements!`
                      : `${(TOTAL_CREDITS_REQUIRED - totalCreditsEarned).toFixed(1)} credits remaining for graduation`
                    }
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gray-800">
                    {totalCreditsEarned.toFixed(1)}/{TOTAL_CREDITS_REQUIRED}
                  </div>
                  <div className="text-sm text-gray-500">Credits</div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3">
                <div
                  className={`h-3 rounded-full transition-all duration-500 ${
                    meetsRequirements
                      ? 'bg-gradient-to-r from-green-400 to-green-600'
                      : 'bg-gradient-to-r from-optio-purple to-optio-pink'
                  }`}
                  style={{
                    width: `${Math.min((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100, 100)}%`
                  }}
                ></div>
              </div>
              <div className="text-center mt-2 text-sm text-gray-600">
                {Math.round((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100)}% Complete
              </div>
            </div>
          </div>

          {/* Subject Credits Grid with Circular Progress */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {creditProgress.map((credit) => {
              const radius = 45;
              const circumference = 2 * Math.PI * radius;
              const strokeDashoffset = circumference - (credit.progressPercentage / 100) * circumference;

              return (
                <div
                  key={credit.subject}
                  className={`bg-white rounded-xl p-6 shadow-sm border transition-all duration-200 hover:shadow-md ${
                    credit.isComplete
                      ? 'border-green-200 bg-green-50'
                      : credit.creditsEarned > 0
                        ? 'border-blue-200'
                        : 'border-gray-100'
                  }`}
                >
                  <div className="flex flex-col items-center mb-4">
                    {/* Circular Progress Indicator */}
                    <div className="relative w-32 h-32 mb-3">
                      <svg className="transform -rotate-90 w-32 h-32">
                        {/* Background circle */}
                        <circle
                          cx="64"
                          cy="64"
                          r={radius}
                          stroke="#E5E7EB"
                          strokeWidth="8"
                          fill="none"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="64"
                          cy="64"
                          r={radius}
                          stroke={credit.isComplete ? '#10B981' : credit.creditsEarned > 0 ? '#6D469B' : '#D1D5DB'}
                          strokeWidth="8"
                          fill="none"
                          strokeDasharray={circumference}
                          strokeDashoffset={strokeDashoffset}
                          strokeLinecap="round"
                          className="transition-all duration-500 ease-out"
                        />
                      </svg>
                      {/* Center content */}
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        {credit.isComplete ? (
                          <svg className="w-8 h-8 text-green-600 mb-1" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
                          </svg>
                        ) : (
                          <div className="text-center">
                            <div className="text-2xl font-bold text-gray-800">
                              {Math.round(credit.progressPercentage)}%
                            </div>
                            <div className="text-xs text-gray-500">complete</div>
                          </div>
                        )}
                      </div>
                    </div>

                    <h3 className="font-semibold text-gray-800 text-center mb-1">
                      {credit.displayName}
                    </h3>

                    <div className="text-center mb-2">
                      <div className="text-sm font-bold text-gray-700">
                        {credit.creditsEarned.toFixed(1)} / {credit.creditsRequired} Credits
                      </div>
                      {credit.xpEarned > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {credit.xpEarned} XP earned
                        </div>
                      )}
                    </div>
                  </div>

                  {credit.creditsEarned === 0 && (
                    <p className="text-xs text-gray-400 italic text-center">
                      No progress yet - start learning to earn credits!
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CreditProgressModal;