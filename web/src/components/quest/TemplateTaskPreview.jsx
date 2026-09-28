import React, { useState } from 'react';
import { CheckIcon, FireIcon } from '@heroicons/react/24/outline';
import { getPillarData } from '../../utils/pillarMappings';
import { brandPillarData, leadSubjectName } from '../../utils/pillarStandIn';

/**
 * A quest's authored tasks, before the student has picked it up
 * (QuestEnrollment). Start Quest comes first; the tasks below are there to
 * spark an approach, not to be a checklist (2026-09-28).
 *
 * Required tasks come with the quest and are listed as such. Optional ones
 * are ideas the student can pick, and only the picked ones are copied into
 * their quest: enroll sends them as template_task_ids, which the backend
 * honours (routes/quest/enrollment.template_task_wanted). Picking nothing
 * starts the quest empty and opens the wizard to build their own.
 *
 * A quest that does not allow custom tasks keeps the old behaviour: every
 * task is listed and every task comes, because the student could not add
 * their own afterwards.
 */
const TemplateTaskPreview = ({ quest, tasks, hidePillars, isEnrolling, onEnroll, isStaffViewer }) => {
  const [picked, setPicked] = useState(() => new Set());
  const allowsPicking = quest?.allow_custom_tasks !== false;

  const required = tasks.filter((t) => t.is_required);
  const optional = tasks.filter((t) => !t.is_required);
  const startingCount = allowsPicking ? required.length + picked.size : tasks.length;

  const toggle = (id) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const start = () => {
    if (!allowsPicking) {
      onEnroll();
      return;
    }
    onEnroll({ template_task_ids: [...picked] });
  };

  const startingLine = startingCount > 0
    ? `You'll start with ${startingCount} task${startingCount === 1 ? '' : 's'}.`
    : "You'll build your own tasks next.";

  return (
    <div className="mb-8">
      {/* Start first, so the button is not below a long list */}
      <div className="bg-white rounded-xl shadow-md p-5 sm:p-6 mb-6 flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <h2 className="text-xl font-bold text-gray-900">Ready to start?</h2>
          <p className="text-sm text-gray-600 mt-1">
            {allowsPicking && optional.length > 0
              ? `Pick any ideas below that you like and they come with you. ${startingLine}`
              : startingLine}
          </p>
          {isStaffViewer && (
            <p className="mt-2 text-sm text-gray-500">
              {allowsPicking && optional.length > 0
                ? 'Students click Start Quest to add this quest to their account, with any ideas they picked.'
                : 'Students click Start Quest to add this quest and its tasks to their account.'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={start}
          disabled={isEnrolling}
          className="btn-primary btn-lg min-h-[44px] touch-manipulation flex-shrink-0"
        >
          <FireIcon className="w-5 h-5 inline mr-2" />
          {isEnrolling ? 'Starting...' : 'Start Quest'}
        </button>
      </div>

      {required.length > 0 && (
        <section className="mb-6">
          <h3 className="text-lg font-bold text-gray-900">
            {allowsPicking ? 'Every student does these' : 'Quest tasks'}
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            {allowsPicking ? 'They come with the quest.' : 'Complete these tasks to finish the quest.'}
          </p>
          <div className="space-y-3">
            {required.map((task) => (
              <TaskRow key={task.id} task={task} hidePillars={hidePillars} />
            ))}
          </div>
        </section>
      )}

      {optional.length > 0 && (
        <section>
          <h3 className="text-lg font-bold text-gray-900">
            {allowsPicking ? 'Ways to approach this quest' : required.length > 0 ? 'More tasks' : 'Quest tasks'}
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            {allowsPicking
              ? 'Ideas for where to take it. Pick the ones that interest you, or none, and add your own after you start.'
              : 'These come with the quest too.'}
          </p>
          <div className="space-y-3">
            {optional.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                hidePillars={hidePillars}
                selectable={allowsPicking}
                selected={picked.has(task.id)}
                onToggle={() => toggle(task.id)}
              />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

function TaskRow({ task, hidePillars, selectable = false, selected = false, onToggle }) {
  const pillarData = hidePillars ? brandPillarData(getPillarData(task.pillar)) : getPillarData(task.pillar);
  const label = hidePillars ? leadSubjectName(task) : pillarData.name;

  const body = (
    <div className="flex items-start gap-4">
      {selectable && (
        <span
          aria-hidden="true"
          className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-md border-2 flex items-center justify-center transition-colors ${
            selected ? 'bg-optio-purple border-optio-purple text-white' : 'border-gray-300 bg-white'
          }`}
        >
          {selected && <CheckIcon className="w-4 h-4" />}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <h4 className="text-base font-bold text-gray-900">{task.title}</h4>
          {label && (
            <span
              className="px-2 py-0.5 rounded-full text-xs font-semibold"
              style={{ backgroundColor: `${pillarData.color}20`, color: pillarData.color }}
            >
              {label}
            </span>
          )}
          <span
            className="px-2 py-0.5 rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: pillarData.color }}
          >
            {task.xp_value} XP
          </span>
        </div>
        {/* whitespace-pre-line keeps the hard returns authors type into task
            descriptions (ticket 3a9e16c1). */}
        {task.description && (
          <p className="text-sm text-gray-700 whitespace-pre-line">{task.description}</p>
        )}
      </div>
    </div>
  );

  if (!selectable) {
    return <div className="bg-white rounded-xl p-4 border-2 border-gray-100">{body}</div>;
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={selected}
      onClick={onToggle}
      className={`w-full text-left rounded-xl p-4 border-2 transition-all ${
        selected ? 'border-optio-purple bg-optio-purple/5' : 'bg-white border-gray-100 hover:border-gray-300'
      }`}
    >
      {body}
    </button>
  );
}

export default TemplateTaskPreview;
