import PropTypes from 'prop-types';
import { Link } from 'react-router-dom';
import { ExclamationTriangleIcon } from '@heroicons/react/24/outline';

const RHYTHM_DISPLAY = {
  in_flow: { label: 'In Flow', color: 'bg-green-500' },
  building: { label: 'Building', color: 'bg-blue-500' },
  resting: { label: 'Resting', color: 'bg-amber-500' },
  fresh_return: { label: 'Fresh Return', color: 'bg-teal-500' },
  ready_to_begin: { label: 'Ready to Begin', color: 'bg-gray-400' },
  finding_rhythm: { label: 'Finding Rhythm', color: 'bg-purple-500' },
  ready_when_you_are: { label: 'Ready When You Are', color: 'bg-gray-400' },
};

const CaseloadEngagementSummary = ({ summary }) => {
  if (!summary) return null;

  const { total_students, rhythm_counts, students_needing_attention } = summary;

  // Build ordered bar segments
  const barOrder = ['in_flow', 'building', 'fresh_return', 'finding_rhythm', 'resting', 'ready_when_you_are', 'ready_to_begin'];
  const segments = barOrder
    .filter(key => rhythm_counts[key] > 0)
    .map(key => ({
      key,
      count: rhythm_counts[key],
      pct: total_students > 0 ? (rhythm_counts[key] / total_students) * 100 : 0,
      ...RHYTHM_DISPLAY[key],
    }));

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Caseload Engagement</h3>

      {/* Rhythm distribution bar */}
      {total_students > 0 && (
        <>
          <div className="flex rounded-full overflow-hidden h-3 mb-2">
            {segments.map(seg => (
              <div
                key={seg.key}
                className={`${seg.color} transition-all duration-500`}
                style={{ width: `${Math.max(seg.pct, 2)}%` }}
                title={`${seg.label}: ${seg.count}`}
              />
            ))}
          </div>

          {/* Legend */}
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mb-4">
            {segments.map(seg => (
              <span key={seg.key} className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${seg.color}`} />
                {seg.label}: {seg.count}
              </span>
            ))}
          </div>
        </>
      )}

      {/* Needs attention callout */}
      {students_needing_attention && students_needing_attention.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mt-2">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-800 mb-2">
            <ExclamationTriangleIcon className="w-4 h-4" />
            {students_needing_attention.length} student{students_needing_attention.length !== 1 ? 's' : ''} may need a check-in
          </div>
          <div className="space-y-1">
            {students_needing_attention.slice(0, 5).map(s => (
              <div key={s.id} className="flex items-center justify-between text-xs">
                <span className="text-gray-700 font-medium">{s.name}</span>
                <div className="flex items-center gap-2">
                  <span className="text-gray-500">
                    {s.days_since_activity === 999
                      ? 'No activity yet'
                      : `${s.days_since_activity}d since activity`
                    }
                  </span>
                  <Link
                    to={`/advisor/checkin/${s.id}`}
                    className="text-optio-purple hover:text-optio-pink font-medium"
                  >
                    Check in
                  </Link>
                </div>
              </div>
            ))}
            {students_needing_attention.length > 5 && (
              <p className="text-xs text-gray-500 pt-1">
                + {students_needing_attention.length - 5} more
              </p>
            )}
          </div>
        </div>
      )}

      {total_students === 0 && (
        <p className="text-sm text-gray-500">No students assigned yet.</p>
      )}
    </div>
  );
};

CaseloadEngagementSummary.propTypes = {
  summary: PropTypes.shape({
    total_students: PropTypes.number,
    rhythm_counts: PropTypes.object,
    students_needing_attention: PropTypes.array,
    per_student_rhythm: PropTypes.object,
  }),
};

export default CaseloadEngagementSummary;
