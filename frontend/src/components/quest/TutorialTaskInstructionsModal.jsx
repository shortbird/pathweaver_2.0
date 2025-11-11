import { getPillarData } from '../../utils/pillarMappings';

const TutorialTaskInstructionsModal = ({ task, onClose }) => {
  const pillarData = getPillarData(task.pillar);

  // Tutorial task instructions mapping
  const getTutorialInstructions = (taskTitle) => {
    const instructions = {
      'Complete your profile': {
        text: 'Add your first name and last name to your profile to help others recognize you.',
        link: '/settings',
        linkText: 'Go to Profile Settings',
        steps: [
          'Click the link below to go to your profile settings',
          'Fill in your first name and last name',
          'Save your changes',
          'This task will complete automatically!'
        ]
      },
      'Write your bio': {
        text: 'Tell others about yourself! Write at least 20 characters in your bio.',
        link: '/settings',
        linkText: 'Go to Profile Settings',
        steps: [
          'Click the link below to go to your profile settings',
          'Scroll to the bio section',
          'Write a short description about yourself (at least 20 characters)',
          'Save your changes',
          'This task will complete automatically!'
        ]
      },
      'Make portfolio public': {
        text: 'Share your accomplishments with the world by making your portfolio public.',
        link: '/settings',
        linkText: 'Go to Privacy Settings',
        steps: [
          'Click the link below to go to your settings',
          'Find the portfolio privacy toggle',
          'Switch it to "Public"',
          'This task will complete automatically!'
        ]
      },
      'Pick up your first quest': {
        text: 'Start your learning journey by choosing a quest that interests you.',
        link: '/quests',
        linkText: 'Browse Available Quests',
        steps: [
          'Click the link below to see all available quests',
          'Find a quest that interests you',
          'Click "Start Quest" or "Enroll"',
          'This task will complete automatically once you enroll in 2 quests!'
        ]
      },
      'Customize a task': {
        text: 'Personalize your quest by adding your own custom task.',
        link: '/quests',
        linkText: 'View Your Active Quests',
        steps: [
          'Go to one of your active quests (not the tutorial)',
          'Click the "Add Task" button',
          'Create a custom task for your quest',
          'This task will complete automatically!'
        ]
      },
      'Complete your first task': {
        text: 'Finish a task in any quest to earn XP and make progress.',
        link: '/quests',
        linkText: 'View Your Active Quests',
        steps: [
          'Go to one of your active quests',
          'Choose a task to work on',
          'Submit your evidence for the task',
          'This task will complete automatically!'
        ]
      },
      'Ask the AI tutor': {
        text: 'Get help with your learning by chatting with our AI tutor.',
        link: '/tutor',
        linkText: 'Open AI Tutor',
        steps: [
          'Click the link below to open the AI tutor',
          'Type a question or ask for help',
          'Send your message',
          'This task will complete automatically!'
        ]
      },
      'Make a connection': {
        text: 'Connect with other learners to share your journey.',
        link: '/connections',
        linkText: 'Go to Connections',
        steps: [
          'Click the link below to go to your connections page',
          'Click "Add Connection"',
          'Enter another user\'s email address',
          'Send the connection request',
          'This task will complete automatically!'
        ]
      },
      'Connect with a parent': {
        text: 'Invite a parent or guardian to monitor your learning progress.',
        link: '/settings',
        linkText: 'Go to Parent Settings',
        steps: [
          'Click the link below to go to settings',
          'Find the "Parent Connections" section',
          'Enter your parent\'s email address',
          'Send the invitation',
          'Ask your parent to accept the invitation',
          'This task will complete automatically when they approve!'
        ]
      },
      'Add an observer': {
        text: 'Invite a teacher, mentor, or advisor to observe your progress.',
        link: '/settings',
        linkText: 'Go to Observer Settings',
        steps: [
          'Click the link below to go to settings',
          'Find the "Observer" section',
          'Enter the observer\'s email address',
          'Send the invitation',
          'This task will complete automatically!'
        ]
      },
      'Start a badge': {
        text: 'Choose a badge to pursue and track your progress toward mastery.',
        link: '/badges',
        linkText: 'Browse Badges',
        steps: [
          'Click the link below to see all available badges',
          'Find a badge that interests you',
          'Click "Select Badge" or "Start Pursuing"',
          'This task will complete automatically!'
        ]
      },
      'Complete your first quest': {
        text: 'Finish all required tasks in a quest to earn the completion bonus.',
        link: '/quests',
        linkText: 'View Your Active Quests',
        steps: [
          'Go to one of your active quests (not the tutorial)',
          'Complete all the required tasks',
          'This task will complete automatically when you finish a quest!'
        ]
      }
    };

    return instructions[taskTitle] || {
      text: 'Complete this task by taking the action described in the task title.',
      link: '/dashboard',
      linkText: 'Go to Dashboard',
      steps: ['This task will complete automatically when you perform the action!']
    };
  };

  const instructions = getTutorialInstructions(task.title);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex items-center justify-center min-h-screen px-4 pt-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div
          className="fixed inset-0 transition-opacity bg-gray-500 bg-opacity-75"
          onClick={onClose}
        ></div>

        {/* Center modal */}
        <span className="hidden sm:inline-block sm:align-middle sm:h-screen">&#8203;</span>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white rounded-xl text-left overflow-hidden shadow-2xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full">
          {/* Header */}
          <div className="px-8 py-6 border-b border-gray-200">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <h3 className="text-2xl font-bold text-gray-900 mb-2" style={{ fontFamily: 'Poppins' }}>
                  {task.title}
                </h3>
                <div className="flex items-center gap-3">
                  <div className="text-sm font-semibold uppercase tracking-wide" style={{ color: pillarData.color, fontFamily: 'Poppins' }}>
                    {pillarData.name}
                  </div>
                  <div
                    className="px-3 py-1 rounded-full text-sm font-bold"
                    style={{
                      backgroundColor: `${pillarData.color}20`,
                      color: pillarData.color,
                      fontFamily: 'Poppins'
                    }}
                  >
                    {task.xp_amount || task.xp_value || 0} XP
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Instructions Content */}
          <div className="px-8 py-6">
            {/* Description */}
            {task.description && (
              <div className="mb-6">
                <p className="text-gray-700 leading-relaxed">{task.description}</p>
              </div>
            )}

            {/* Instructions */}
            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 mb-6">
              <div className="flex items-start">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-blue-500 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm font-medium text-blue-800" style={{ fontFamily: 'Poppins' }}>
                    {instructions.text}
                  </p>
                </div>
              </div>
            </div>

            {/* Steps */}
            <div className="mb-6">
              <h4 className="text-lg font-bold text-gray-900 mb-3" style={{ fontFamily: 'Poppins' }}>
                How to Complete:
              </h4>
              <ol className="space-y-2">
                {instructions.steps.map((step, index) => (
                  <li key={index} className="flex items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-sm font-bold mr-3" style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}>
                      {index + 1}
                    </span>
                    <span className="text-gray-700 pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Action Link */}
            {instructions.link && (
              <a
                href={instructions.link}
                className="block w-full text-center px-6 py-3 rounded-lg font-bold text-white transition-all hover:shadow-lg"
                style={{ backgroundColor: pillarData.color, fontFamily: 'Poppins' }}
                onClick={onClose}
              >
                {instructions.linkText}
              </a>
            )}

            {/* Auto-complete notice */}
            <div className="mt-4 text-center text-sm text-gray-500">
              💡 This task will complete automatically - no need to submit evidence!
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TutorialTaskInstructionsModal;
