import React from 'react';
import { getAllCreditProgress, calculateTotalCredits, TOTAL_CREDITS_REQUIRED, meetsGraduationRequirements } from '../../utils/creditRequirements';

const CreditProgressModal = ({ isOpen, onClose, subjectXP, pendingSubjectXP = {}, isOwner, getStudentFirstName, onAccreditedDiplomaClick }) => {
  if (!isOpen) return null;

  // Memoize expensive credit calculations
  const creditProgress = getAllCreditProgress(subjectXP);
  const totalCreditsEarned = calculateTotalCredits(subjectXP);
  const meetsRequirements = meetsGraduationRequirements(subjectXP);

  // Calculate pending credits
  const pendingCreditProgress = getAllCreditProgress(pendingSubjectXP);
  const totalPendingCredits = calculateTotalCredits(pendingSubjectXP);
  const hasPendingCredits = totalPendingCredits > 0;

  // Merge verified and pending progress for display
  const mergedProgress = creditProgress.map(credit => {
    const pendingCredit = pendingCreditProgress.find(p => p.subject === credit.subject);
    return {
      ...credit,
      pendingCredits: pendingCredit?.creditsEarned || 0,
      pendingXP: pendingSubjectXP[credit.subject] || 0,
      totalWithPending: credit.creditsEarned + (pendingCredit?.creditsEarned || 0)
    };
  });

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
        className="bg-white rounded-xl max-w-full sm:max-w-4xl mx-2 sm:mx-0 w-full max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Credit Progress"
      >
        <div className="sticky top-0 p-6 bg-gradient-primary z-10">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <h2 className="text-2xl font-bold text-white">Diploma Credits Breakdown</h2>
            <button
              onClick={onClose}
              className="text-white hover:bg-white/20 rounded-full p-2 min-h-[44px] min-w-[44px] transition-colors"
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
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 px-4 py-2 min-h-[44px] rounded-lg transition-all duration-200 text-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span>How does this work?</span>
            </button>
          </div>

          {/* Legend for verified vs pending */}
          {hasPendingCredits && (
            <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <h4 className="font-medium text-gray-700 mb-3 text-sm">Credit Status</h4>
              <div className="flex flex-wrap gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-gradient-to-r from-optio-purple to-optio-pink"></div>
                  <span className="text-gray-600">Verified Credits</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 rounded bg-amber-400 border-2 border-dashed border-amber-600"></div>
                  <span className="text-gray-600">Pending Teacher Verification</span>
                </div>
              </div>
            </div>
          )}

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
                  <div className="text-sm text-gray-500">Verified Credits</div>
                </div>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 relative overflow-hidden">
                {/* Pending credits bar (behind verified) */}
                {hasPendingCredits && (
                  <div
                    className="absolute h-3 rounded-full bg-amber-300"
                    style={{
                      width: `${Math.min(((totalCreditsEarned + totalPendingCredits) / TOTAL_CREDITS_REQUIRED) * 100, 100)}%`
                    }}
                  ></div>
                )}
                {/* Verified credits bar */}
                <div
                  className={`relative h-3 rounded-full transition-all duration-500 ${
                    meetsRequirements
                      ? 'bg-gradient-to-r from-green-400 to-green-600'
                      : 'bg-gradient-to-r from-optio-purple to-optio-pink'
                  }`}
                  style={{
                    width: `${Math.min((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100, 100)}%`
                  }}
                ></div>
              </div>
              <div className="flex justify-between mt-2 text-sm text-gray-600">
                <span>{Math.round((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100)}% Complete</span>
                {hasPendingCredits && (
                  <span className="text-amber-600">
                    +{totalPendingCredits.toFixed(1)} pending verification
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Subject Credits Grid with Circular Progress */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {mergedProgress.map((credit) => {
              const radius = 45;
              const circumference = 2 * Math.PI * radius;
              const verifiedOffset = circumference - (credit.progressPercentage / 100) * circumference;
              const totalPercent = Math.min((credit.totalWithPending / credit.creditsRequired) * 100, 100);
              const pendingOffset = circumference - (totalPercent / 100) * circumference;
              const hasPending = credit.pendingCredits > 0;

              return (
                <div
                  key={credit.subject}
                  className={`bg-white rounded-xl p-6 shadow-sm border transition-all duration-200 hover:shadow-md ${
                    credit.isComplete
                      ? 'border-green-200 bg-green-50'
                      : credit.creditsEarned > 0
                        ? 'border-blue-200'
                        : hasPending
                          ? 'border-amber-200'
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
                        {/* Pending progress circle (behind verified) */}
                        {hasPending && (
                          <circle
                            cx="64"
                            cy="64"
                            r={radius}
                            stroke="#FBBF24"
                            strokeWidth="8"
                            fill="none"
                            strokeDasharray={circumference}
                            strokeDashoffset={pendingOffset}
                            strokeLinecap="round"
                            className="transition-all duration-500 ease-out"
                          />
                        )}
                        {/* Verified progress circle */}
                        <circle
                          cx="64"
                          cy="64"
                          r={radius}
                          stroke={credit.isComplete ? '#10B981' : credit.creditsEarned > 0 ? '#6D469B' : '#D1D5DB'}
                          strokeWidth="8"
                          fill="none"
                          strokeDasharray={circumference}
                          strokeDashoffset={verifiedOffset}
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
                            <div className="text-xs text-gray-500">verified</div>
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
                      {hasPending && (
                        <div className="flex items-center justify-center gap-1 mt-1">
                          <svg className="w-3.5 h-3.5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-xs text-amber-600 font-medium">
                            +{credit.pendingCredits.toFixed(1)} pending
                          </span>
                        </div>
                      )}
                      {credit.xpEarned > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          {credit.xpEarned} XP verified
                          {credit.pendingXP > 0 && (
                            <span className="text-amber-500"> (+{credit.pendingXP} pending)</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {credit.creditsEarned === 0 && !hasPending && (
                    <p className="text-xs text-gray-400 italic text-center">
                      No progress yet - start learning to earn credits!
                    </p>
                  )}

                  {credit.creditsEarned === 0 && hasPending && (
                    <p className="text-xs text-amber-600 italic text-center">
                      Credits awaiting teacher verification
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Pending verification notice */}
          {hasPendingCredits && (
            <div className="mt-8 p-4 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-start gap-3">
                <svg className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div>
                  <h4 className="font-medium text-amber-800">Pending Verification</h4>
                  <p className="text-sm text-amber-700 mt-1">
                    {isOwner ? 'You have' : `${getStudentFirstName()} has`} {totalPendingCredits.toFixed(1)} credits awaiting teacher verification.
                    Once verified, these credits will be added to {isOwner ? 'your' : 'their'} diploma progress.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CreditProgressModal;
