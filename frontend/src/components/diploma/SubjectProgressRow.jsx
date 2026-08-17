import React from 'react';
import PropTypes from 'prop-types';
import { formatCredits } from '../../utils/creditRequirements';

// Subject progress row with full name. Shared core primitive used by the Optio
// credits panel (SkillsGrowth) and by program diploma widgets (e.g. Hearthwood
// Academy) so programs render credit rows without re-implementing them.
//
// Three student-facing states:
//   - Complete (green + check): the requirement is met. Reads as DONE at a
//     glance rather than as one more purple bar among many — a finished subject
//     that looks identical to a nearly-finished one is the difference between
//     "I'm getting somewhere" and a wall of indistinguishable progress.
//   - In progress (purple): credit earned, requirement not yet met.
//   - Pending approval (yellow): requested but not yet finalized.
//
// Over-earned credit is called out rather than clipped. A row reading "2.25/1"
// with a full bar otherwise looks like a bug, and it is also the explanation
// for why a student's total XP implies more credits than the headline shows:
// the excess is on their transcript but cannot count toward another subject.
const SubjectProgressRow = ({ credit, pendingCredits = 0 }) => {
  const earnedPct = Math.min(credit.progressPercentage, 100);
  const totalPct = Math.min(
    ((credit.creditsEarned + pendingCredits) / credit.creditsRequired) * 100,
    100
  );
  const hasPending = pendingCredits > 0;
  const isComplete = credit.isComplete;
  // Set by getCreditStanding; absent when a caller passes raw progress.
  const beyond = credit.creditsBeyond ?? Math.max(0, credit.creditsEarned - credit.creditsRequired);
  const counted = credit.creditsCounted ?? Math.min(credit.creditsEarned, credit.creditsRequired);
  const overflowIn = credit.overflowIn || 0;
  const overflowOut = credit.overflowOut || 0;
  const remaining = Math.round((credit.creditsRequired - counted) * 100) / 100;

  return (
    <div className="flex items-center gap-3">
      {/* Status indicator — a check for done, a dot for everything else. */}
      {isComplete ? (
        <svg className="w-4 h-4 flex-shrink-0 text-green-600" viewBox="0 0 20 20"
             fill="currentColor" role="img" aria-label="Complete">
          <path fillRule="evenodd" clipRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" />
        </svg>
      ) : (
        <div className={`w-4 h-4 flex-shrink-0 flex items-center justify-center`}>
          <div className={`w-2 h-2 rounded-full ${
            credit.creditsEarned > 0
              ? 'bg-optio-purple'
              : hasPending
                ? 'bg-yellow-400'
                : 'bg-gray-300'
          }`} />
        </div>
      )}

      {/* Subject name, plus where surplus went or came from. A student who
          over-earned CTE should be able to see that the excess became elective
          credit rather than wondering where it went. */}
      <span className="w-36 flex-shrink-0">
        <span className={`text-sm block ${
          isComplete ? 'text-gray-900 font-medium' : 'text-gray-700'
        }`}>
          {credit.displayName}
        </span>
        {overflowIn > 0 && (
          <span className="text-[11px] text-gray-400 block leading-tight">
            +{overflowIn} from other subjects
          </span>
        )}
        {overflowOut > 0 && (
          <span className="text-[11px] text-gray-400 block leading-tight">
            {overflowOut} counted as electives
          </span>
        )}
      </span>

      {/* Progress bar — back-to-front: yellow (pending) → earned. */}
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden relative">
        {hasPending && (
          <div
            className="absolute inset-y-0 left-0 bg-yellow-400 rounded-full"
            style={{ width: `${totalPct}%` }}
          />
        )}
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
            isComplete ? 'bg-green-500' : 'bg-optio-purple'
          }`}
          style={{ width: `${earnedPct}%` }}
        />
      </div>

      {/* Credits. What's LEFT is the useful number while a subject is unfinished;
          once it's done the ratio is just confirmation, so it recedes. */}
      <span className="text-xs w-24 text-right flex-shrink-0 whitespace-nowrap">
        {isComplete ? (
          // Stacked, right-aligned: the surplus sits UNDER "Done" so every
          // subject's "Done" lands on the same baseline down the column. Inline,
          // it shoved the one over-earned row's label left of all the others.
          <span className="inline-flex flex-col items-end leading-tight">
            <span className="text-green-700 font-medium">Done</span>
            {beyond > 0 && (
              <span className="text-[11px] text-gray-400 font-normal">+{beyond}</span>
            )}
          </span>
        ) : (
          <span className="text-gray-500">
            {remaining} to go
            {hasPending && (
              <span className="text-yellow-600 ml-1">+{formatCredits(pendingCredits)}</span>
            )}
          </span>
        )}
      </span>
    </div>
  );
};

SubjectProgressRow.propTypes = {
  credit: PropTypes.object.isRequired,
  pendingCredits: PropTypes.number,
};

export default SubjectProgressRow;
