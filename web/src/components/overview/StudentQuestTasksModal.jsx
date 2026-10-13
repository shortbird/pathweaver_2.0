import React from 'react';
import PropTypes from 'prop-types';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { Modal } from '../ui/Modal';

/**
 * Every task on one of a student's active quests, done and not done, for a
 * teacher or school admin.
 *
 * Horizon, 2026-10-13 (ticket 8c21d8e7): from a student's overview the
 * director could see quest names and finished work only. "Is there a way to
 * see their next steps they haven't done without ... masquerade as student?"
 * This is that view, read-only: what is still to do first, then what is done.
 */
export function useStudentQuestsWithTasks(studentId, enabled) {
  return useQuery({
    queryKey: ['advisor-student-quests-with-tasks', studentId],
    queryFn: async () => {
      const res = await api.get(`/api/advisor/students/${studentId}/quests-with-tasks`);
      return res.data?.quests || [];
    },
    enabled: !!studentId && enabled,
    staleTime: 60 * 1000,
  });
}

function formatDue(dateString) {
  if (!dateString) return null;
  const d = new Date(`${String(dateString).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function TaskRow({ task }) {
  const due = !task.completed ? formatDue(task.due_date) : null;
  return (
    <li className="flex items-start gap-3 py-2">
      <span
        aria-hidden="true"
        className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border text-xs ${
          task.completed ? 'border-green-600 bg-green-600 text-white' : 'border-gray-300 bg-white'
        }`}
      >
        {task.completed ? '✓' : ''}
      </span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm ${task.completed ? 'text-gray-500' : 'text-gray-900 font-medium'}`}>
          {task.title}
        </p>
        <p className="text-xs text-gray-500">
          {task.xp_value ? `${task.xp_value} XP` : null}
          {task.xp_value && due ? ' · ' : null}
          {due ? `Due ${due}` : null}
        </p>
      </div>
    </li>
  );
}

TaskRow.propTypes = {
  task: PropTypes.object.isRequired,
};

const StudentQuestTasksModal = ({ isOpen, onClose, studentId, questId, questTitle }) => {
  const { data: quests, isLoading, isError } = useStudentQuestsWithTasks(studentId, isOpen);
  const quest = (quests || []).find((q) => q.quest_id === questId);
  const tasks = quest?.tasks || [];
  const todo = tasks.filter((t) => !t.completed);
  const done = tasks.filter((t) => t.completed);

  let body;
  if (isLoading) {
    body = <p className="text-sm text-gray-500">Loading tasks...</p>;
  } else if (isError) {
    body = <p className="text-sm text-red-600">Could not load this quest&apos;s tasks. Try again in a moment.</p>;
  } else if (!quest || tasks.length === 0) {
    body = <p className="text-sm text-gray-500">This quest has no tasks yet.</p>;
  } else {
    body = (
      <div className="space-y-5">
        <p className="text-sm text-gray-600">
          {done.length} of {tasks.length} tasks done
        </p>
        <section aria-label="Still to do">
          <h4 className="text-sm font-semibold text-gray-800">Still to do ({todo.length})</h4>
          {todo.length === 0 ? (
            <p className="py-2 text-sm text-gray-500">Every task is done.</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {todo.map((t) => <TaskRow key={t.id} task={t} />)}
            </ul>
          )}
        </section>
        {done.length > 0 && (
          <section aria-label="Done">
            <h4 className="text-sm font-semibold text-gray-800">Done ({done.length})</h4>
            <ul className="divide-y divide-gray-100">
              {done.map((t) => <TaskRow key={t.id} task={t} />)}
            </ul>
          </section>
        )}
      </div>
    );
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={questTitle} size="md">
      {body}
    </Modal>
  );
};

StudentQuestTasksModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  studentId: PropTypes.string,
  questId: PropTypes.string,
  questTitle: PropTypes.string,
};

export default StudentQuestTasksModal;
