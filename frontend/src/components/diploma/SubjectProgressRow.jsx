import React from 'react';
import PropTypes from 'prop-types';

// Subject progress row with full name. Shared core primitive used by the Optio
// credits panel (SkillsGrowth) and by program diploma widgets (e.g. OpenEd
// Academy) so programs render credit rows without re-implementing them.
//
// Two student-facing states:
//   - Approved (purple): superadmin has finalized the credit — it's on the diploma
//   - Pending Approval (yellow): requested but not yet finalized.
const SubjectProgressRow = ({ credit, pendingCredits = 0 }) => {
  const earnedPct = Math.min(credit.progressPercentage, 100);
  const totalPct = Math.min(
    ((credit.creditsEarned + pendingCredits) / credit.creditsRequired) * 100,
    100
  );
  const hasPending = pendingCredits > 0;

  return (
    <div className="flex items-center gap-3">
      {/* Status indicator */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
        credit.creditsEarned > 0
          ? 'bg-optio-purple'
          : hasPending
            ? 'bg-yellow-400'
            : 'bg-gray-300'
      }`} />

      {/* Subject name */}
      <span className="text-sm text-gray-700 w-36 flex-shrink-0">
        {credit.displayName}
      </span>

      {/* Progress bar — back-to-front: yellow (pending) → purple (approved) */}
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden relative">
        {hasPending && (
          <div
            className="absolute inset-y-0 left-0 bg-yellow-400 rounded-full"
            style={{ width: `${totalPct}%` }}
          />
        )}
        <div
          className="absolute inset-y-0 left-0 rounded-full bg-optio-purple transition-all duration-500"
          style={{ width: `${earnedPct}%` }}
        />
      </div>

      {/* Credits */}
      <span className="text-xs text-gray-500 w-16 text-right flex-shrink-0 whitespace-nowrap">
        {credit.creditsEarned.toFixed(1)}/{credit.creditsRequired}
        {hasPending && (
          <span className="text-yellow-600 ml-1">+{pendingCredits.toFixed(1)}</span>
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
