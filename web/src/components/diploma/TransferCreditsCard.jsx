// Imported credits from an external transcript, as a card on the portfolio.
// Lifted out of DiplomaPage.jsx by QF-02 -- it was always a separate memoized
// component, it just lived in the page file.
import React, { memo, useState } from 'react';
import { TRANSCRIPT_SUBJECT_NAMES } from '../../utils/creditRequirements';


// What an official transcript prints. Shared with every other transcript
// surface and with the backend.
//
// This was a local copy that said 'Career & Tech Ed' for CTE -- a THIRD
// spelling, alongside the 'Career & Technical' the demo used and the
// 'Career & Technical Education' everywhere else. Three abbreviations of one
// subject across one product is what a shared vocabulary is for.
const SUBJECT_DISPLAY_NAMES = TRANSCRIPT_SUBJECT_NAMES;

// Transfer Credits Card - displays imported credits from external transcripts
const TransferCreditsCard = memo(({ transferCredits, className = '' }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!transferCredits || !transferCredits.total_credits) return null;

  const subjectCredits = transferCredits.subject_credits || {};
  const sortedSubjects = Object.entries(subjectCredits)
    .filter(([, credits]) => credits > 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className={`bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden ${className}`}>
      {/* Header */}
      <div
        className="p-6 bg-gradient-to-r from-emerald-500 to-teal-500 text-white cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold">Transfer Credits</h3>
              <p className="text-emerald-100">
                From {transferCredits.school_name || 'Previous School'}
              </p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold">{transferCredits.total_credits.toFixed(1)}</div>
            <div className="text-emerald-100 text-sm">credits</div>
          </div>
        </div>

        {/* Expand indicator */}
        <div className="mt-4 flex items-center justify-center">
          <svg
            className={`w-5 h-5 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </div>

      {/* Expandable Details */}
      {isExpanded && (
        <div className="p-6">
          {/* Subject Breakdown */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Subject Breakdown
            </h4>
            <div className="grid grid-cols-2 gap-3">
              {sortedSubjects.map(([subject, credits]) => (
                <div
                  key={subject}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                >
                  <span className="text-gray-700 font-medium">
                    {SUBJECT_DISPLAY_NAMES[subject] || subject}
                  </span>
                  <span className="text-emerald-600 font-bold">
                    {credits.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Transcript Link */}
          {transferCredits.transcript_url && (
            <div className="pt-4 border-t border-gray-200">
              <a
                href={transferCredits.transcript_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center text-emerald-600 hover:text-emerald-700 font-medium"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                View Transcript
              </a>
            </div>
          )}

          {/* Notes */}
          {transferCredits.notes && (
            <div className="mt-4 p-3 bg-amber-50 rounded-lg text-sm text-amber-800">
              <strong>Note:</strong> {transferCredits.notes}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

TransferCreditsCard.displayName = 'TransferCreditsCard';

export default TransferCreditsCard;
