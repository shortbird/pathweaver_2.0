/**
 * OpenEd Academy diploma widget (program module).
 *
 * The OEA-specific diploma UI, extracted from core SkillsGrowth so core carries
 * no OEA rendering. Registered as a diploma-widget hook in ../registry.jsx; core
 * renders whatever the registry returns for a given diploma context, or its own
 * Optio-credits default. See docs/ARCHITECTURE_CORE_AND_PROGRAMS.md.
 */
import React from 'react';
import { Link } from 'react-router-dom';
import SubjectProgressRow from '../../components/diploma/SubjectProgressRow';
import { oeaAPI } from '../../services/api';

// For OEA students the real diploma is their chosen pathway (parent-attested
// course credits), not Optio's XP-based credits, so we render the OEA pathway
// progress using the same data as the OEA page.
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

/**
 * Diploma-widget hook for OpenEd Academy. Given the overview diploma context,
 * returns the OEA pathway panel (or a choose-pathway prompt) for OEA students,
 * or null for everyone else so core falls back to Optio's XP-based credits.
 */
export function renderOeaDiploma(context) {
  const oea = context?.oea;
  if (!oea?.is_oea_student) return null;
  return oea.progress ? <OeaDiplomaPanel oea={oea} /> : <OeaChoosePathwayPanel />;
}

/**
 * Fetch OEA diploma data for a student. Resolves to the OEA diploma context, or
 * rejects for non-OEA / no-access viewers (callers treat rejection as "no OEA").
 */
export function fetchOeaDiploma(studentId) {
  return oeaAPI.credits(studentId).then((r) => r.data || null);
}
