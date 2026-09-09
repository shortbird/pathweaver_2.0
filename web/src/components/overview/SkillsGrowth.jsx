import React from 'react';
import PropTypes from 'prop-types';
import SkillsRadarChart from '../diploma/SkillsRadarChart';
import useHidePillars from '../../hooks/useHidePillars';
import SubjectProgressRow from '../diploma/SubjectProgressRow';
import { renderDiplomaWidget } from '../../programs/registry';
import {
  getAllCreditProgress,
  getCreditStanding,
  calculateTotalCredits,
  splitCreditProgress,
  formatCredits,
  TOTAL_CREDITS_REQUIRED
} from '../../utils/creditRequirements';

const SkillsGrowth = ({
  xpByPillar = {},
  subjectXp = {},
  pendingSubjectXp = {},
  oea = null,
  totalXp = 0,
  hideHeader = false,
  showDiplomaCredits = true
}) => {
  const hidePillars = useHidePillars();
  // Standing, not a single total: `totalApplied` is progress toward the
  // diploma, `totalEarned` is what's on the transcript. Showing only the first
  // is what made a student's XP look like it disagreed with their credits.
  const standing = getCreditStanding(subjectXp);
  const creditProgress = standing.progress;
  const totalCreditsEarned = standing.totalApplied;
  const { remaining, complete } = splitCreditProgress(creditProgress);
  const creditsLeft = standing.remaining;
  const allComplete = creditProgress.length > 0 && remaining.length === 0;

  const pendingCreditProgress = getAllCreditProgress(pendingSubjectXp);
  const totalPendingCredits = calculateTotalCredits(pendingSubjectXp);
  const hasPendingCredits = totalPendingCredits > 0;
  const pendingBySubject = pendingCreditProgress.reduce((acc, p) => {
    acc[p.subject] = p.creditsEarned;
    return acc;
  }, {});

  // A program that owns the student's diploma (e.g. Hearthwood Academy) renders its
  // own panel via the registry; core carries no program-specific diploma UI and
  // falls back to Optio's XP-based credits below.
  const programDiploma = showDiplomaCredits ? renderDiplomaWidget({ oea }) : null;

  // The left column IS the pillars: a radar chart of the five, plus the total
  // XP that feeds it. A school that has switched them off gets the diploma at
  // full width, with the total XP kept as a strip above it — the number still
  // means something without the taxonomy.
  const twoColumn = showDiplomaCredits && !hidePillars;

  const content = (
    <div className={`grid grid-cols-1 ${twoColumn ? 'lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x' : ''} divide-gray-100`}>
        {hidePillars ? (
          totalXp > 0 && (
            <div className="px-6 pt-6 text-center">
              <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-primary">
                {totalXp.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Total XP</div>
            </div>
          )
        ) : (
        /* Skills Radar Chart Section */
        <div className="p-6">
          <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-4">Learning Pillars</h3>

          {/* Total XP Display */}
          {totalXp > 0 && (
            <div className="mb-4 pb-4 border-b border-gray-100 text-center">
              <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-primary">
                {totalXp.toLocaleString()}
              </div>
              <div className="text-xs text-gray-500 uppercase tracking-wide">Total XP</div>
            </div>
          )}

          {Object.keys(xpByPillar).length > 0 ? (
            <div className="flex justify-center">
              <div className="w-full max-w-[320px]">
                <SkillsRadarChart skillsXP={xpByPillar} compact={true} />
              </div>
            </div>
          ) : (
            <div className="text-center py-8 bg-gray-50 rounded-xl">
              <svg className="w-12 h-12 mx-auto text-gray-300 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              <p className="text-sm text-gray-500">No skill data yet</p>
              <p className="text-xs text-gray-400 mt-1">Complete quests to build your skills</p>
            </div>
          )}
        </div>
        )}

        {/* Diploma section (users 13+). A program may own the student's diploma
            and render its own panel; otherwise show Optio's XP-based credits. */}
        {showDiplomaCredits && (programDiploma || (
          <div className="p-6">
            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-4">Diploma Credits</h3>

            {/* Overall progress. The headline answers "how far am I", the line
                under it answers "how much is left" — which the ratio alone
                never did, because over-earned credit makes 24 minus the total
                the wrong answer (see creditsRemaining). */}
            <div className={`p-4 rounded-lg mb-4 border ${
              allComplete ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'
            }`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-800">
                  {formatCredits(totalCreditsEarned)}/{TOTAL_CREDITS_REQUIRED}
                </span>
                <span className={`text-xs font-medium ${
                  allComplete ? 'text-green-700' : 'text-blue-600'
                }`}>
                  {Math.round((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 relative overflow-hidden">
                {hasPendingCredits && (
                  <div
                    className="absolute inset-y-0 left-0 bg-yellow-400 rounded-full"
                    style={{
                      width: `${Math.min(((totalCreditsEarned + totalPendingCredits) / TOTAL_CREDITS_REQUIRED) * 100, 100)}%`
                    }}
                  ></div>
                )}
                <div
                  className={`absolute inset-y-0 left-0 rounded-full transition-all duration-500 ${
                    allComplete ? 'bg-green-500' : 'bg-gradient-primary'
                  }`}
                  style={{
                    width: `${Math.min((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100, 100)}%`
                  }}
                ></div>
              </div>

              {/* The tally students actually track themselves by. */}
              <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                <span className={allComplete ? 'text-green-800 font-medium' : 'text-gray-600'}>
                  {allComplete
                    ? 'Every subject complete'
                    : `${complete.length} of ${creditProgress.length} subjects complete`}
                </span>
                {!allComplete && (
                  <span className="text-gray-600">
                    {creditsLeft} credit{creditsLeft === 1 ? '' : 's'} to go
                  </span>
                )}
              </div>

              {/* Earned vs applied, stated only when they differ. Credit past
                  every requirement is real and on the transcript; saying so is
                  what stops the headline looking like it lost something. */}
              {standing.beyond > 0 && (
                <p className="mt-1 text-xs text-gray-500">
                  {standing.totalEarned} earned in total
                  {' · '}
                  {standing.beyond} beyond what the diploma requires
                </p>
              )}
              {hasPendingCredits && (
                <div className="mt-2 flex items-center gap-1 text-yellow-700">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-medium">
                    +{formatCredits(totalPendingCredits)} pending approval
                  </span>
                </div>
              )}
            </div>

            {/* Two groups, unfinished first. The panel's job is "what's next",
                and complete-first sorting buried that under a wall of finished
                bars. The finished group stays visible rather than collapsing —
                the pile of done subjects is the part worth looking at. */}
            <div className="space-y-4">
              {remaining.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Still to earn · {remaining.length}
                  </h4>
                  {remaining.map((credit) => (
                    <SubjectProgressRow
                      key={credit.subject}
                      credit={credit}
                      pendingCredits={pendingBySubject[credit.subject] || 0}
                    />
                  ))}
                </div>
              )}

              {complete.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                      <path fillRule="evenodd" clipRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z" />
                    </svg>
                    Complete · {complete.length}
                  </h4>
                  {complete.map((credit) => (
                    <SubjectProgressRow
                      key={credit.subject}
                      credit={credit}
                      pendingCredits={pendingBySubject[credit.subject] || 0}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
  );

  if (hideHeader) {
    return content;
  }

  return (
    <section className="bg-white rounded-2xl shadow-lg overflow-hidden">
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <svg className="w-6 h-6 text-optio-purple" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          <h2 className="text-xl font-bold text-gray-900">
            {hidePillars ? 'Progress' : 'Skills & Growth'}
          </h2>
        </div>
      </div>
      {content}
    </section>
  );
};

SkillsGrowth.propTypes = {
  xpByPillar: PropTypes.object,
  subjectXp: PropTypes.object,
  pendingSubjectXp: PropTypes.object,
  oea: PropTypes.object,
  totalXp: PropTypes.number,
  hideHeader: PropTypes.bool,
  showDiplomaCredits: PropTypes.bool
};

export default SkillsGrowth;
