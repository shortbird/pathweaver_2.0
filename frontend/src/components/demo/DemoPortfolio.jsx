import React from 'react';
import { Link } from 'react-router-dom';
import { useDemo } from '../../contexts/DemoContext';
import {
  AcademicCapIcon,
  SparklesIcon,
  CheckBadgeIcon,
  ArrowRightIcon,
  DocumentTextIcon,
  PhotoIcon
} from '@heroicons/react/24/outline';

// Subject colors
const subjectColors = {
  science: { bg: 'bg-blue-500', light: 'bg-blue-100', text: 'text-blue-700' },
  math: { bg: 'bg-indigo-500', light: 'bg-indigo-100', text: 'text-indigo-700' },
  language_arts: { bg: 'bg-amber-500', light: 'bg-amber-100', text: 'text-amber-700' },
  fine_arts: { bg: 'bg-pink-500', light: 'bg-pink-100', text: 'text-pink-700' },
  digital_literacy: { bg: 'bg-cyan-500', light: 'bg-cyan-100', text: 'text-cyan-700' },
  pe: { bg: 'bg-green-500', light: 'bg-green-100', text: 'text-green-700' },
  health: { bg: 'bg-teal-500', light: 'bg-teal-100', text: 'text-teal-700' },
  social_studies: { bg: 'bg-orange-500', light: 'bg-orange-100', text: 'text-orange-700' },
  financial_literacy: { bg: 'bg-purple-500', light: 'bg-purple-100', text: 'text-purple-700' },
  cte: { bg: 'bg-slate-500', light: 'bg-slate-100', text: 'text-slate-700' },
  electives: { bg: 'bg-gray-500', light: 'bg-gray-100', text: 'text-gray-700' }
};

const PortfolioCard = ({ totalXP, creditsEarned, topSubjects, evidenceType }) => {
  // Map evidence type to icon
  const EvidenceIcon = {
    photo: PhotoIcon,
    link: DocumentTextIcon,
    reflection: DocumentTextIcon
  }[evidenceType] || PhotoIcon;

  return (
    <div className="bg-white rounded-2xl shadow-xl overflow-hidden border border-gray-100">
      {/* Header */}
      <div className="bg-gradient-primary p-6 text-white">
        <div className="flex items-center gap-3 mb-2">
          <AcademicCapIcon className="w-8 h-8" />
          <span className="text-lg font-semibold">My Learning Portfolio</span>
        </div>
        <p className="text-white/80 text-sm">Built automatically as you learn</p>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 border-b border-gray-100">
        <div className="p-4 text-center border-r border-gray-100">
          <p className="text-2xl font-bold text-optio-purple">{totalXP}</p>
          <p className="text-xs text-gray-500 mt-1">Total XP</p>
        </div>
        <div className="p-4 text-center border-r border-gray-100">
          <p className="text-2xl font-bold text-optio-purple">{creditsEarned}</p>
          <p className="text-xs text-gray-500 mt-1">Credits Earned</p>
        </div>
        <div className="p-4 text-center">
          <p className="text-2xl font-bold text-optio-purple">1</p>
          <p className="text-xs text-gray-500 mt-1">Quest Started</p>
        </div>
      </div>

      {/* Subject progress */}
      <div className="p-6 space-y-4">
        <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide">Subject Progress</h4>
        {topSubjects.map(({ subject, name, xp, credits, color }) => {
          const colors = subjectColors[subject] || subjectColors.electives;
          const percentage = Math.min((xp / 500) * 100, 100);
          return (
            <div key={subject} className="space-y-1">
              <div className="flex justify-between text-sm">
                <span className={`font-medium ${colors.text}`}>{name}</span>
                <span className="text-gray-600">{xp} XP</span>
              </div>
              <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                <div
                  className={`h-full ${colors.bg} rounded-full`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Evidence preview */}
      <div className="p-6 bg-gray-50 border-t border-gray-100">
        <h4 className="font-semibold text-gray-900 text-sm uppercase tracking-wide mb-3">Recent Evidence</h4>
        <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
          <div className="p-2 bg-optio-purple/10 rounded-lg">
            <EvidenceIcon className="w-6 h-6 text-optio-purple" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-gray-900 truncate">Task evidence submitted</p>
            <p className="text-xs text-gray-500">Just now</p>
          </div>
          <CheckBadgeIcon className="w-5 h-5 text-green-500 flex-shrink-0" />
        </div>
      </div>
    </div>
  );
};

const DemoPortfolio = () => {
  const { demoState, actions } = useDemo();
  const { totalXPEarned, submittedEvidence, selectedQuest } = demoState;

  const topSubjects = actions.getTopSubjects();
  const creditsEarned = actions.calculateCreditsEarned();

  return (
    <div className="space-y-8 py-4">
      {/* Success message */}
      <div className="text-center">
        <div className="inline-flex items-center gap-2 px-4 py-2 bg-green-100 text-green-800 rounded-full mb-4">
          <SparklesIcon className="w-5 h-5" />
          <span className="font-medium">Demo Complete!</span>
        </div>
        <h2 className="text-3xl font-bold text-gray-900 mb-2">
          You Have Built a Portfolio
        </h2>
        <p className="text-gray-600 max-w-xl mx-auto">
          In just a few minutes, you have started earning real academic credit by doing what you love.
          This is just the beginning!
        </p>
      </div>

      {/* Portfolio preview */}
      <div className="max-w-md mx-auto">
        <PortfolioCard
          totalXP={totalXPEarned}
          creditsEarned={creditsEarned}
          topSubjects={topSubjects}
          evidenceType={submittedEvidence?.type || 'photo'}
        />
      </div>

      {/* CTA */}
      <div className="text-center pt-4">
        <Link
          to="/contact?type=demo"
          className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-primary text-white rounded-lg font-bold text-lg hover:shadow-xl transform hover:scale-105 transition-all min-h-[56px] touch-manipulation"
        >
          <span>Get More Info</span>
          <ArrowRightIcon className="w-5 h-5" />
        </Link>
      </div>

      {/* Restart option */}
      <div className="text-center pt-4">
        <button
          onClick={actions.resetDemo}
          className="text-sm text-gray-500 hover:text-optio-purple hover:underline"
        >
          Try the demo again with a different quest
        </button>
      </div>
    </div>
  );
};

export default DemoPortfolio;
