// Step 2: interests, diploma subjects and challenge level -- everything the
// generator is told before it writes anything. The subject ring shows how much
// credit the student already holds, which is what stops them spending a quest
// on credit they have.
import React from 'react';
import { CheckIcon } from '@heroicons/react/24/outline';

import SubjectLockToggle from '../SubjectLockToggle';
import { INTEREST_OPTIONS, CHALLENGE_LEVELS, DIPLOMA_SUBJECTS } from './wizardOptions';

const InterestsStep = ({
  additionalFeedback, setAdditionalFeedback, challengeLevel, setChallengeLevel,
  classSubjectName, creditStanding, crossCurricularSubjects, embedded,
  generateTasks, hideDiplomaSubjects, loading, loadingCredits,
  selectedInterests, setStep, sz, toggleInterest, toggleSubject, XP_PER_CREDIT,
  strictSubjects, setStrictSubjects, selectedSubjectNames,
}) => (
  <div>
    <h2 className={sz.heading}>
      Personalize Your Tasks
    </h2>
    <p className={embedded ? sz.subheading : 'text-gray-600 mb-6 text-lg'}>
      {hideDiplomaSubjects
        ? 'Pick interests and add any specific ideas to generate tasks'
        : 'Select interests or diploma subjects to generate personalized tasks'}
    </p>

    {classSubjectName && (
      <div className="mb-6 rounded-lg bg-optio-purple/5 border border-optio-purple/20 px-4 py-3">
        <p className="text-sm text-gray-700">
          Every task you add counts toward your{' '}
          <span className="font-semibold">{classSubjectName}</span> credit.
        </p>
      </div>
    )}

    {/* Interests */}
    <div className={sz.section}>
      <h3 className={sz.sectionTitle}>Your Interests (Optional)</h3>
      <p className={sz.sectionHint}>
        Choose topics you enjoy to make tasks more engaging
      </p>
      <div className={embedded ? 'grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2' : 'grid grid-cols-2 md:grid-cols-5 gap-3'}>
        {INTEREST_OPTIONS.map(interest => (
          <button
            key={interest.id}
            onClick={() => toggleInterest(interest.id)}
            className={`border-2 text-center transition-all min-h-[44px] ${
              embedded ? 'p-2 rounded-lg hover:shadow-md' : 'p-4 rounded-xl hover:shadow-lg'
            } ${
              selectedInterests.includes(interest.id)
                ? 'border-optio-pink bg-optio-pink/5 shadow-lg'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={embedded ? 'text-xl mb-0.5' : 'text-3xl mb-2'}>{interest.icon}</div>
            <div className={embedded ? 'text-xs font-medium leading-tight' : 'text-sm font-medium'}>{interest.label}</div>
          </button>
        ))}
      </div>
    </div>

    {/* Diploma Subjects with Circular Progress.
        Suppressed for LTI/Canvas iframe consumers — diploma credits
        are an Optio-platform concept that doesn't translate to a
        Canvas-graded assignment. */}
    {!hideDiplomaSubjects && (
    <div className="mb-8">
      <h3 className="font-semibold text-lg mb-1">
        Diploma Credits (Optional)
      </h3>
      <p className="text-gray-500 text-sm mb-4">
        Select subjects you want to earn credits toward. Your progress is shown below.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {DIPLOMA_SUBJECTS.map(subject => {
          // creditsCounted includes credit that overflowed in from an
          // over-earned subject, so a subject already satisfied that way
          // reads as complete here too.
          const standing = creditStanding[subject.id];
          const current = Math.round((standing?.creditsCounted || 0) * XP_PER_CREDIT);
          const required = Math.round((standing?.creditsRequired || 0) * XP_PER_CREDIT);
          const percentage = standing?.progressPercentage || 0;
          const isComplete = !!standing?.isComplete;
          const isSelected = crossCurricularSubjects.includes(subject.id);

          // Circular progress values
          const radius = 28;
          const circumference = 2 * Math.PI * radius;
          const offset = circumference - (percentage / 100) * circumference;

          return (
            <button
              key={subject.id}
              onClick={() => toggleSubject(subject.id)}
              className={`p-4 border-2 rounded-xl text-center transition-all hover:shadow-lg flex flex-col items-center ${
                isSelected
                  ? 'border-optio-purple bg-optio-purple/5 shadow-lg ring-2 ring-optio-purple ring-offset-2'
                  : isComplete
                    ? 'border-green-300 bg-green-50 hover:border-green-400'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
              }`}
            >
              {/* Circular Progress */}
              <div className="relative w-16 h-16 mb-2">
                <svg className="transform -rotate-90 w-16 h-16">
                  {/* Background circle */}
                  <circle
                    cx="32"
                    cy="32"
                    r={radius}
                    stroke="#E5E7EB"
                    strokeWidth="5"
                    fill="none"
                  />
                  {/* Progress circle */}
                  <circle
                    cx="32"
                    cy="32"
                    r={radius}
                    stroke={isComplete ? '#10B981' : isSelected ? '#6D469B' : '#9CA3AF'}
                    strokeWidth="5"
                    fill="none"
                    strokeDasharray={circumference}
                    strokeDashoffset={loadingCredits ? circumference : offset}
                    strokeLinecap="round"
                    className="transition-all duration-500 ease-out"
                  />
                </svg>
                {/* Center content */}
                <div className="absolute inset-0 flex items-center justify-center">
                  {loadingCredits ? (
                    <div className="w-4 h-4 border-2 border-gray-300 border-t-optio-purple rounded-full animate-spin" />
                  ) : isComplete ? (
                    <CheckIcon className="w-6 h-6 text-green-600 stroke-[3]" />
                  ) : (
                    <span className="text-sm font-bold text-gray-700">
                      {Math.round(percentage)}%
                    </span>
                  )}
                </div>
              </div>

              {/* Subject Label */}
              <div className="text-xs font-semibold text-gray-800 mb-1">
                {subject.label}
              </div>

              {/* XP Progress */}
              {!loadingCredits && (
                <div className="text-xs text-gray-500">
                  {current.toLocaleString()} / {required.toLocaleString()} XP
                </div>
              )}

              {/* Selected indicator */}
              {isSelected && (
                <div className="mt-2 text-xs font-medium text-optio-purple flex items-center gap-1">
                  <CheckIcon className="w-3 h-3" />
                  Selected
                </div>
              )}
            </button>
          );
        })}
      </div>

      {crossCurricularSubjects.length > 0 && (
        <SubjectLockToggle
          checked={strictSubjects}
          onChange={setStrictSubjects}
          subjectNames={selectedSubjectNames}
        />
      )}
    </div>
    )}

    {/* Challenge Level */}
    <div className={sz.section}>
      <h3 className={sz.sectionTitle}>Challenge Level</h3>
      <p className={sz.sectionHint}>
        How ambitious should your tasks be? We'll remember your choice.
      </p>
      <div className={embedded ? 'grid grid-cols-3 gap-2' : 'grid grid-cols-1 sm:grid-cols-3 gap-3'}>
        {CHALLENGE_LEVELS.map(level => (
          <button
            key={level.id}
            onClick={() => setChallengeLevel(level.id)}
            aria-pressed={challengeLevel === level.id}
            className={`border-2 text-left transition-all min-h-[44px] ${
              embedded ? 'p-2 rounded-lg' : 'p-4 rounded-xl hover:shadow-lg'
            } ${
              challengeLevel === level.id
                ? 'border-optio-purple bg-optio-purple/5 shadow-lg'
                : 'border-gray-200 hover:border-gray-300'
            }`}
          >
            <div className={embedded ? 'text-sm font-bold' : 'font-bold'}>
              {level.label}
            </div>
            <div className={embedded ? 'text-xs text-gray-500 leading-tight' : 'text-sm text-gray-500'}>
              {level.description}
            </div>
          </button>
        ))}
      </div>
    </div>

    {/* Additional Feedback */}
    <div className={sz.section}>
      <h3 id="additional-feedback-label" className={sz.sectionTitle}>
        Any specific ideas? (Optional)
      </h3>
      <textarea
        id="additional-feedback"
        value={additionalFeedback}
        onChange={(e) => setAdditionalFeedback(e.target.value)}
        placeholder="Tell us more about what you'd like to learn..."
        className={`w-full border-2 border-gray-200 resize-none focus:outline-none focus:ring-2 focus:ring-optio-purple focus:border-transparent min-h-[44px] ${
          embedded ? 'p-2 rounded-lg text-sm' : 'p-4 rounded-xl'
        }`}
        rows={embedded ? 2 : 4}
        aria-labelledby="additional-feedback-label"
      />
    </div>

    <div className="flex flex-col sm:flex-row gap-2 sm:justify-between">
      <button
        onClick={() => setStep(1)}
        className={sz.navBtn}
      >
        Back
      </button>
      <button
        onClick={generateTasks}
        disabled={loading}
        className={sz.primaryBtn}
      >
        {loading ? 'Generating Tasks...' : 'Generate Tasks'}
      </button>
    </div>
  </div>
);

export default InterestsStep;
