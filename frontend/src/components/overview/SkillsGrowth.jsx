import React from 'react';
import PropTypes from 'prop-types';
import SkillsRadarChart from '../diploma/SkillsRadarChart';
import {
  getAllCreditProgress,
  calculateTotalCredits,
  TOTAL_CREDITS_REQUIRED,
  meetsGraduationRequirements
} from '../../utils/creditRequirements';

// Subject progress row with full name
const SubjectProgressRow = ({ credit }) => {
  return (
    <div className="flex items-center gap-3">
      {/* Status indicator */}
      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
        credit.isComplete ? 'bg-green-500' : credit.creditsEarned > 0 ? 'bg-optio-purple' : 'bg-gray-300'
      }`} />

      {/* Subject name */}
      <span className="text-sm text-gray-700 w-36 flex-shrink-0">
        {credit.displayName}
      </span>

      {/* Progress bar */}
      <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${
            credit.isComplete ? 'bg-green-500' : 'bg-optio-purple'
          }`}
          style={{ width: `${Math.min(credit.progressPercentage, 100)}%` }}
        />
      </div>

      {/* Credits */}
      <span className="text-xs text-gray-500 w-12 text-right flex-shrink-0">
        {credit.creditsEarned.toFixed(1)}/{credit.creditsRequired}
      </span>
    </div>
  );
};

const SkillsGrowth = ({
  xpByPillar = {},
  subjectXp = {},
  pendingSubjectXp = {},
  totalXp = 0,
  hideHeader = false,
  showDiplomaCredits = true
}) => {
  const totalCreditsEarned = calculateTotalCredits(subjectXp);
  const meetsRequirements = meetsGraduationRequirements(subjectXp);
  const creditProgress = getAllCreditProgress(subjectXp);

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

        {/* Diploma Credits Section - only shown for users 13+ */}
        {showDiplomaCredits && (
          <div className="p-6">
            <h3 className="font-bold text-gray-800 text-sm uppercase tracking-wider mb-4">Diploma Credits</h3>

            {/* Overall Progress Bar */}
            <div className={`p-4 rounded-lg mb-4 ${
              meetsRequirements
                ? 'bg-green-50 border border-green-200'
                : 'bg-blue-50 border border-blue-200'
            }`}>
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm font-semibold text-gray-800">
                  {totalCreditsEarned.toFixed(1)}/{TOTAL_CREDITS_REQUIRED}
                </span>
                <span className={`text-xs font-medium ${
                  meetsRequirements ? 'text-green-600' : 'text-blue-600'
                }`}>
                  {Math.round((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    meetsRequirements
                      ? 'bg-gradient-to-r from-green-400 to-green-600'
                      : 'bg-gradient-to-r from-optio-purple to-optio-pink'
                  }`}
                  style={{
                    width: `${Math.min((totalCreditsEarned / TOTAL_CREDITS_REQUIRED) * 100, 100)}%`
                  }}
                ></div>
              </div>
              {meetsRequirements && (
                <div className="mt-2 flex items-center gap-1 text-green-700">
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span className="text-xs font-medium">Meets graduation requirements</span>
                </div>
              )}
            </div>

            {/* Subject Progress List */}
            <div className="space-y-2.5">
              {creditProgress.map((credit) => (
                <SubjectProgressRow key={credit.subject} credit={credit} />
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
  totalXp: PropTypes.number,
  hideHeader: PropTypes.bool,
  showDiplomaCredits: PropTypes.bool
};

export default SkillsGrowth;
