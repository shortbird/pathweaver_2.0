import React from 'react';
import PropTypes from 'prop-types';
import { useNavigate } from 'react-router-dom';
import { useFamilyScope } from '../../contexts/FamilyScopeContext';

const STATUS_STYLES = {
  not_started: { label: 'Not started', className: 'bg-gray-100 text-gray-600' },
  in_progress: { label: 'In progress', className: 'bg-optio-purple/10 text-optio-purple' },
  completed: { label: 'Complete', className: 'bg-green-100 text-green-700' }
};

const QuestRow = ({ quest, index, studentId, viewerMode }) => {
  const status = STATUS_STYLES[quest.status] || STATUS_STYLES.not_started;
  const { completed_tasks: completedTasks = 0, total_tasks: totalTasks = 0 } = quest.progress || {};
  const navigate = useNavigate();
  const { enterScope } = useFamilyScope();

  // A parent opens the child's quest in family scope (the same page the child
  // sees, pointed at the child). Observers have no per-quest page, so their
  // rows stay static. This used to link linked students to the thinner
  // ParentQuestView and leave dependents to the act-as flow (2026-09-15).
  const linkable = viewerMode === 'parent' && studentId && quest.status !== 'not_started';

  const row = (
    <div className="flex items-center gap-3 py-2.5 px-3">
      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-gray-100 text-gray-500 text-xs font-semibold flex items-center justify-center">
        {index + 1}
      </span>
      <span className="flex-1 text-sm font-medium text-gray-800 line-clamp-1">{quest.title}</span>
      {totalTasks > 0 && (
        <span className="hidden sm:inline text-xs text-gray-400">
          {completedTasks}/{totalTasks} tasks
        </span>
      )}
      {quest.due_date && quest.status !== 'completed' && (
        <span className="hidden sm:inline text-xs text-gray-400">
          Due {new Date(quest.due_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
        </span>
      )}
      <span className={`flex-shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${status.className}`}>
        {status.label}
      </span>
    </div>
  );

  if (linkable) {
    return (
      <button
        type="button"
        onClick={() => { enterScope(studentId); navigate(`/quests/${quest.quest_id}`); }}
        className="block w-full text-left rounded-lg hover:bg-optio-purple/5 transition-colors"
      >
        {row}
      </button>
    );
  }
  return <div className="rounded-lg">{row}</div>;
};

QuestRow.propTypes = {
  quest: PropTypes.object.isRequired,
  index: PropTypes.number.isRequired,
  studentId: PropTypes.string,
  viewerMode: PropTypes.string
};

/**
 * EnrolledCoursesSection - Read-only class/course structure for a student.
 *
 * Shows each enrolled course with its ordered projects and per-project status,
 * so a parent can see what their child is enrolled in even before any work has
 * been completed. Rendered on the parent Family Dashboard child view.
 */
const EnrolledCoursesSection = ({ courses, studentId = null, viewerMode = 'student' }) => {
  if (!courses?.length) return null;

  return (
    <div className="space-y-4">
      {courses.map((course) => (
        <div key={course.class_id || course.course_id} className="border border-gray-200 rounded-xl overflow-hidden bg-white">
          <div className="flex items-start gap-4 p-4 sm:p-5">
            {course.cover_image_url && (
              <img
                src={course.cover_image_url}
                alt=""
                className="hidden sm:block w-20 h-20 rounded-lg object-cover flex-shrink-0"
              />
            )}
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-semibold text-gray-900">{course.title}</h3>
                {course.enrollment_status === 'completed' && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                    Complete
                  </span>
                )}
              </div>
              {course.description && (
                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{course.description}</p>
              )}
              <p className="text-xs text-gray-400 mt-2">
                {/* Org classes complete on an XP threshold; courses on projects done */}
                {course.xp_progress?.xp_threshold > 0
                  ? `${course.xp_progress.earned_xp} of ${course.xp_progress.xp_threshold} XP earned`
                  : `${course.quests_completed} of ${course.total_quests} projects complete`}
                {course.credit_subject && course.credit_amount
                  ? ` · ${course.credit_amount} ${course.credit_subject} credit`
                  : ''}
              </p>
            </div>
          </div>
          {course.quests?.length > 0 && (
            <div className="border-t border-gray-100 px-2 py-2">
              {course.quests.map((quest, index) => (
                <QuestRow
                  key={quest.quest_id}
                  quest={quest}
                  index={index}
                  studentId={studentId}
                  viewerMode={viewerMode}
                />
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

EnrolledCoursesSection.propTypes = {
  courses: PropTypes.array,
  studentId: PropTypes.string,
  viewerMode: PropTypes.string
};

export default EnrolledCoursesSection;
