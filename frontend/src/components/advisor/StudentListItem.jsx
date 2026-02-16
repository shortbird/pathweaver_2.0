import PropTypes from 'prop-types';

const RHYTHM_COLORS = {
  in_flow: { bg: 'bg-green-500', pulse: true },
  building: { bg: 'bg-blue-500', pulse: false },
  resting: { bg: 'bg-amber-500', pulse: false },
  fresh_return: { bg: 'bg-teal-500', pulse: false },
  ready_to_begin: { bg: 'bg-gray-400', pulse: false },
  finding_rhythm: { bg: 'bg-optio-purple', pulse: false },
  ready_when_you_are: { bg: 'bg-gray-400', pulse: false },
};

const getStudentName = (student) => {
  return student.display_name ||
    `${student.first_name || ''} ${student.last_name || ''}`.trim() ||
    'Student';
};

const StudentListItem = ({ student, rhythm, isSelected, onClick }) => {
  const name = getStudentName(student);
  const rhythmConfig = RHYTHM_COLORS[rhythm] || RHYTHM_COLORS.finding_rhythm;

  return (
    <button
      onClick={() => onClick(student)}
      className={`
        w-full flex items-center gap-3 px-3 py-3 text-left transition-colors rounded-lg
        ${isSelected
          ? 'bg-gradient-to-r from-optio-purple/10 to-optio-pink/10 border border-optio-purple/30'
          : 'hover:bg-gray-50'
        }
      `}
    >
      {/* Rhythm dot */}
      <div className="relative flex-shrink-0">
        <div className={`w-2.5 h-2.5 rounded-full ${rhythmConfig.bg}`} />
        {rhythmConfig.pulse && (
          <div className={`absolute inset-0 w-2.5 h-2.5 rounded-full ${rhythmConfig.bg} animate-ping opacity-75`} />
        )}
      </div>

      {/* Avatar */}
      {student.avatar_url ? (
        <img
          src={student.avatar_url}
          alt=""
          className="w-9 h-9 rounded-full object-cover flex-shrink-0"
        />
      ) : (
        <div className="w-9 h-9 rounded-full bg-purple-100 flex items-center justify-center text-optio-purple text-sm font-semibold flex-shrink-0">
          {name.charAt(0).toUpperCase()}
        </div>
      )}

      {/* Name + meta */}
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-medium truncate ${isSelected ? 'text-optio-purple' : 'text-gray-900'}`}>
          {name}
        </p>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          <span>{student.total_xp || 0} XP</span>
          {student.last_checkin ? (
            <>
              <span className="text-gray-300">|</span>
              <span>{student.last_checkin.days_since_checkin}d ago</span>
            </>
          ) : null}
        </div>
      </div>
    </button>
  );
};

StudentListItem.propTypes = {
  student: PropTypes.object.isRequired,
  rhythm: PropTypes.string,
  isSelected: PropTypes.bool,
  onClick: PropTypes.func.isRequired,
};

export default StudentListItem;
