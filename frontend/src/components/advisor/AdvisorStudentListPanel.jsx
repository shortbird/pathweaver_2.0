import { useState, useMemo } from 'react';
import PropTypes from 'prop-types';
import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
import StudentListItem from './StudentListItem';

const RHYTHM_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'in_flow', label: 'In Flow', color: 'bg-green-500' },
  { key: 'building', label: 'Building', color: 'bg-blue-500' },
  { key: 'resting', label: 'Resting', color: 'bg-amber-500' },
  { key: 'attention', label: 'Needs Attention', color: 'bg-red-400' },
];

const getStudentName = (student) => {
  return student.display_name ||
    `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
    'Student';
};

const AdvisorStudentListPanel = ({
  students,
  perStudentRhythm,
  rhythmCounts,
  selectedStudentId,
  onSelectStudent,
  onBack, // mobile: used to close panel
  isMobile = false,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [rhythmFilter, setRhythmFilter] = useState('all');

  const filteredStudents = useMemo(() => {
    let filtered = students;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(s => {
        const name = getStudentName(s).toLowerCase();
        const email = (s.email || '').toLowerCase();
        return name.includes(q) || email.includes(q);
      });
    }

    // Rhythm filter
    if (rhythmFilter !== 'all') {
      if (rhythmFilter === 'attention') {
        filtered = filtered.filter(s => {
          const r = perStudentRhythm[s.id];
          return r === 'resting' || r === 'ready_when_you_are' || r === 'ready_to_begin';
        });
      } else {
        filtered = filtered.filter(s => perStudentRhythm[s.id] === rhythmFilter);
      }
    }

    return filtered;
  }, [students, searchQuery, rhythmFilter, perStudentRhythm]);

  const inFlowCount = rhythmCounts?.in_flow || 0;

  return (
    <div className={`flex flex-col h-full bg-white ${isMobile ? '' : 'border-r border-gray-200'}`}>
      {/* Search */}
      <div className="p-3 border-b border-gray-100">
        <div className="relative">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search students..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-2 focus:ring-optio-purple/30 focus:border-optio-purple transition-all"
          />
        </div>
      </div>

      {/* Rhythm filter chips */}
      <div className="px-3 py-2 flex flex-wrap gap-1.5 border-b border-gray-100">
        {RHYTHM_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setRhythmFilter(f.key)}
            className={`
              inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors
              ${rhythmFilter === f.key
                ? 'bg-optio-purple text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }
            `}
          >
            {f.color && <div className={`w-2 h-2 rounded-full ${f.color}`} />}
            {f.label}
          </button>
        ))}
      </div>

      {/* Student list */}
      <div className="flex-1 overflow-y-auto px-2 py-1">
        {filteredStudents.length === 0 ? (
          <div className="py-8 text-center text-sm text-gray-500">
            {searchQuery || rhythmFilter !== 'all'
              ? 'No students match your filters'
              : 'No students assigned yet'
            }
          </div>
        ) : (
          filteredStudents.map(student => (
            <StudentListItem
              key={student.id}
              student={student}
              rhythm={perStudentRhythm[student.id]}
              isSelected={selectedStudentId === student.id}
              onClick={() => onSelectStudent(student)}
            />
          ))
        )}
      </div>

      {/* Footer summary */}
      <div className="px-3 py-2 border-t border-gray-100 text-xs text-gray-500">
        {students.length} student{students.length !== 1 ? 's' : ''}
        {inFlowCount > 0 && `, ${inFlowCount} in flow`}
      </div>
    </div>
  );
};

AdvisorStudentListPanel.propTypes = {
  students: PropTypes.array.isRequired,
  perStudentRhythm: PropTypes.object.isRequired,
  rhythmCounts: PropTypes.object,
  selectedStudentId: PropTypes.string,
  onSelectStudent: PropTypes.func.isRequired,
  onBack: PropTypes.func,
  isMobile: PropTypes.bool,
};

export default AdvisorStudentListPanel;
