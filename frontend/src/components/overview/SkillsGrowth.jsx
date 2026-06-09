import React from 'react';
import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import SkillsRadarChart from '../diploma/SkillsRadarChart';
import {
  getAllCreditProgress,
  calculateTotalCredits,
  TOTAL_CREDITS_REQUIRED
} from '../../utils/creditRequirements';

// Subject progress row with full name.
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

// OpenEd Academy diploma panel. For OEA students the real diploma is their
// chosen pathway (parent-attested course credits), not Optio's XP-based credits,
// so we render the OEA pathway progress here using the same data as the OEA page.
const OeaDiplomaPanel = ({ oea }) => {
  const progress = oea.progress;
  const pathwayName = oea.enrollment?.pathway?.name;

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider">OpenEd Academy Diploma</h3>
        {pathwayName && (
          <span className="text-xs font-medium text-optio-purple">{pathwayName}</span>
        )}
      </div>

      {/* Overall pathway progress */}
      <div className="p-4 rounded-lg mb-4 bg-[#F3EFF4] border border-purple-200">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-semibold text-gray-800">
            {progress.total_earned}/{progress.total_required} credits
          </span>
          <span className="text-xs font-medium text-optio-purple">{progress.percent_complete}%</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
          <div
            className="h-2 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink transition-all duration-500"
            style={{ width: `${Math.min(progress.percent_complete, 100)}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-gray-500">
          <span>Foundation {progress.foundation_earned}/{progress.foundation_required}</span>
          <span>Elective {progress.elective_earned}/{progress.elective_required}</span>
        </div>
        {progress.is_complete && (
          <p className="mt-2 text-xs font-medium text-green-700">All requirements met</p>
        )}
      </div>

      {/* Per-requirement breakdown (reuses the subject row look) */}
      <div className="space-y-2.5">
        {progress.requirements.map((req) => (
          <SubjectProgressRow
            key={req.key}
            credit={{
              subject: req.key,
              displayName: req.label,
              creditsEarned: req.earned,
              creditsRequired: req.required,
              progressPercentage: req.required > 0 ? (req.earned / req.required) * 100 : 0
            }}
          />
        ))}
      </div>

      <Link
        to="/opened-academy"
        className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-optio-purple hover:text-optio-pink"
      >
        View diploma
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </Link>
    </div>
  );
};

// Shown to OEA students who don't have a pathway selected yet — instead of
// Optio's XP-based credits, which don't apply to them.
const OeaChoosePathwayPanel = () => (
  <div className="p-6">
    <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-4">OpenEd Academy Diploma</h3>
    <div className="p-5 rounded-lg bg-[#F3EFF4] border border-purple-200 text-center">
      <svg className="w-10 h-10 mx-auto text-optio-purple mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l9-5-9-5-9 5 9 5z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 14l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14z" />
      </svg>
      <p className="text-sm text-gray-700 mb-4">
        Choose a diploma pathway to start tracking your credits toward an OpenEd Academy diploma.
      </p>
      <Link
        to="/opened-academy"
        className="inline-flex items-center justify-center min-h-[40px] px-5 rounded-lg font-semibold text-white bg-gradient-to-r from-optio-purple to-optio-pink"
      >
        Choose your pathway
      </Link>
    </div>
  </div>
);

const SkillsGrowth = ({
  xpByPillar = {},
  subjectXp = {},
  pendingSubjectXp = {},
  oea = null,
  totalXp = 0,
  hideHeader = false,
  showDiplomaCredits = true
}) => {
  // OEA students track their diploma through OEA, not Optio XP credits. With a
  // chosen pathway, show their pathway progress; without one, prompt them to
  // choose. Non-OEA students keep the Optio credit panel.
  const useOeaDiploma = !!oea?.progress;
  const oeaNeedsPathway = !!oea?.is_oea_student && !oea?.progress;
  const totalCreditsEarned = calculateTotalCredits(subjectXp);
  const creditProgress = getAllCreditProgress(subjectXp);

  const pendingCreditProgress = getAllCreditProgress(pendingSubjectXp);
  const totalPendingCredits = calculateTotalCredits(pendingSubjectXp);
  const hasPendingCredits = totalPendingCredits > 0;
  const pendingBySubject = pendingCreditProgress.reduce((acc, p) => {
    acc[p.subject] = p.creditsEarned;
    return acc;
  }, {});

  const content = (
    <div className={`grid grid-cols-1 ${showDiplomaCredits ? 'lg:grid-cols-2 divide-y lg:divide-y-0 lg:divide-x' : ''} divide-gray-100`}>
        {/* Skills Radar Chart Section */}
        <div className="p-6">
          <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-4">Learning Pillars</h3>

          {/* Total XP Display */}
          {totalXp > 0 && (
            <div className="mb-4 pb-4 border-b border-gray-100 text-center">
              <div className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-optio-purple to-optio-pink">
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

        {/* Diploma section - only shown for users 13+. OEA students see their
            OpenEd Academy pathway progress instead of Optio's XP-based credits. */}
        {showDiplomaCredits && useOeaDiploma && (
          <OeaDiplomaPanel oea={oea} />
        )}
        {showDiplomaCredits && oeaNeedsPathway && (
          <OeaChoosePathwayPanel />
        )}
        {showDiplomaCredits && !useOeaDiploma && !oeaNeedsPathway && (
          <div className="p-6">
            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-4">Diploma Credits</h3>

            {/* Overall Progress Bar */}
            <div className="p-4 rounded-lg mb-4 bg-blue-50 border border-blue-200">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-800">
                  {totalCreditsEarned.toFixed(1)}/{TOTAL_CREDITS_REQUIRED}
                </span>
                <span className="text-xs font-medium text-blue-600">
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
                  className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-optio-purple to-optio-pink transition-all duration-500"
                  style={{
                    width: `${Math.min((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100, 100)}%`
                  }}
                ></div>
              </div>
              {hasPendingCredits && (
                <div className="mt-2 flex items-center gap-1 text-yellow-700">
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-xs font-medium">
                    +{totalPendingCredits.toFixed(1)} pending approval
                  </span>
                </div>
              )}
            </div>

            {/* Subject Progress List */}
            <div className="space-y-2.5">
              {creditProgress.map((credit) => (
                <SubjectProgressRow
                  key={credit.subject}
                  credit={credit}
                  pendingCredits={pendingBySubject[credit.subject] || 0}
                />
              ))}
            </div>
          </div>
        )}
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
          <h2 className="text-xl font-bold text-gray-900" style={{ fontFamily: 'Poppins', fontWeight: 700 }}>
            Skills & Growth
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
