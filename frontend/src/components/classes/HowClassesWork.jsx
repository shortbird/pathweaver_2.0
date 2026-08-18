import React from 'react';
import PropTypes from 'prop-types';

/**
 * The five-step explanation of a credit class, shared by the creation wizard
 * (StartClassPage) and the empty state on /my-classes. Creating a class is most
 * students' first encounter with transcript credit, so the same walkthrough
 * appears in both places rather than living only in the wizard.
 */
export const CLASS_STEPS = [
  {
    title: 'Pick something you care about',
    body: 'A class is built around a real interest — training for a season, learning an instrument, running a small business.',
  },
  {
    title: 'Add tasks',
    body: 'Get AI suggestions based on your interests, or write your own. You can keep adding tasks the whole time.',
  },
  {
    title: 'Do the work, show the evidence',
    body: 'Complete a task and submit what you made. Each completed task earns XP.',
  },
  {
    title: '1,000 XP earns a credit',
    body: 'Every task in a class counts 100% toward its subject. 1,000 XP is 0.5 transcript credit — one semester.',
  },
  {
    title: 'Submit for review',
    body: 'Optio reviews your class and awards the credit. It shows up on your transcript.',
  },
];

const HowClassesWork = ({ className = '', title = 'How a class works' }) => (
  <div className={`card ${className}`}>
    <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
    <ol className="mt-4 space-y-4">
      {CLASS_STEPS.map((step, i) => (
        <li key={step.title} className="flex gap-3">
          <span
            aria-hidden="true"
            className="flex-shrink-0 w-7 h-7 rounded-full bg-optio-purple/10 text-optio-purple text-sm font-semibold flex items-center justify-center"
          >
            {i + 1}
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">{step.title}</p>
            <p className="text-sm text-gray-600 mt-0.5">{step.body}</p>
          </div>
        </li>
      ))}
    </ol>
  </div>
);

HowClassesWork.propTypes = {
  className: PropTypes.string,
  title: PropTypes.string,
};

export default HowClassesWork;
