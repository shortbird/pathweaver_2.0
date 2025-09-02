import React, { useState } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { 
  Globe, Lock, Upload, Camera, FileText, Link, 
  AlertCircle, Eye, EyeOff, CheckCircle, Info
} from 'lucide-react';
import InfoModal from './InfoModal';

const WorkSubmission = () => {
  const { demoState, actions } = useDemo();
  const { selectedQuests } = demoState;
  const [activeQuest, setActiveQuest] = useState(0);
  const [activeTask, setActiveTask] = useState(0);
  const [workText, setWorkText] = useState('');
  const [visibility, setVisibility] = useState('public');
  const [submitted, setSubmitted] = useState({});
  const [showAccountabilityModal, setShowAccountabilityModal] = useState(false);

  const currentQuest = selectedQuests[activeQuest];
  const currentTask = currentQuest?.tasks[activeTask];

  const handleSubmit = () => {
    if (!workText.trim()) return;

    const submissionKey = `${currentQuest.id}-${currentTask.id}`;
    actions.submitWork(currentQuest.id, currentTask.id, workText, visibility);
    
    setSubmitted(prev => ({ ...prev, [submissionKey]: true }));
    setWorkText('');
    
    // Move to next task or quest
    setTimeout(() => {
      if (activeTask < currentQuest.tasks.length - 1) {
        setActiveTask(activeTask + 1);
      } else if (activeQuest < selectedQuests.length - 1) {
        setActiveQuest(activeQuest + 1);
        setActiveTask(0);
      }
    }, 1500);
  };

  const getSubmissionStatus = () => {
    const submissionKey = `${currentQuest?.id}-${currentTask?.id}`;
    return submitted[submissionKey];
  };

  const submissionTypes = [
    { icon: <FileText className="w-5 h-5" />, label: 'Text Description' },
    { icon: <Camera className="w-5 h-5" />, label: 'Photo/Video' },
    { icon: <Link className="w-5 h-5" />, label: 'External Link' },
    { icon: <Upload className="w-5 h-5" />, label: 'Document Upload' }
  ];

  if (!currentQuest) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Please select quests first</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h2 className="text-3xl font-bold text-[#003f5c]">
          Submit Your Work
        </h2>
        <p className="text-gray-600">
          Share what you've created - publicly or confidentially
        </p>
      </div>

      {/* Quest/Task Selector */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg text-[#003f5c]">{currentQuest.title}</h3>
          <div className="text-sm text-gray-600">
            Quest {activeQuest + 1} of {selectedQuests.length}
          </div>
        </div>
        
        {/* Task Tabs */}
        <div className="flex gap-2 overflow-x-auto pb-2">
          {currentQuest.tasks.map((task, idx) => {
            const taskKey = `${currentQuest.id}-${task.id}`;
            const isSubmitted = submitted[taskKey];
            
            return (
              <button
                key={idx}
                onClick={() => setActiveTask(idx)}
                className={`px-4 py-2 rounded-lg font-medium text-sm whitespace-nowrap transition-all ${
                  idx === activeTask 
                    ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white shadow-lg' 
                    : isSubmitted
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-[#6d469b]'
                }`}
              >
                {isSubmitted && <CheckCircle className="w-4 h-4 inline mr-1" />}
                {task.title}
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Task Submission */}
      {!getSubmissionStatus() ? (
        <div className="space-y-6">
          {/* Task Info */}
          <div className="bg-white rounded-xl border-2 border-gray-200 p-6">
            <h4 className="font-bold text-lg text-[#003f5c] mb-2">
              Task: {currentTask.title}
            </h4>
            <p className="text-gray-600 mb-4">
              Submit your work for this task. Remember, quality matters when it's public!
            </p>

            {/* Submission Type Selector */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {submissionTypes.map((type, idx) => (
                <div
                  key={idx}
                  className="flex flex-col items-center gap-2 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors"
                >
                  <div className="text-[#6d469b]">{type.icon}</div>
                  <span className="text-xs text-gray-600">{type.label}</span>
                </div>
              ))}
            </div>

            {/* Work Input */}
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700 mb-1 block">
                  Describe your work
                </span>
                <textarea
                  value={workText}
                  onChange={(e) => setWorkText(e.target.value)}
                  placeholder="Example: I created a family recipe book with 25 traditional recipes, including photos and stories from my grandparents..."
                  className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-[#6d469b] focus:outline-none transition-colors"
                  rows="4"
                />
              </label>

              {/* Visibility Toggle */}
              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="font-semibold text-[#003f5c]">Visibility Settings</h5>
                  <button
                    onClick={() => setShowAccountabilityModal(true)}
                    className="text-sm text-[#6d469b] hover:underline flex items-center gap-1"
                  >
                    <Info className="w-4 h-4" />
                    Why this matters
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Public Option */}
                  <button
                    onClick={() => setVisibility('public')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      visibility === 'public' 
                        ? 'border-green-500 bg-green-50' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        visibility === 'public' ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        <Globe className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h6 className="font-semibold text-[#003f5c]">Public (Recommended)</h6>
                        <p className="text-xs text-gray-600 mt-1">
                          Visible on your diploma. Quality speaks for itself.
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Confidential Option */}
                  <button
                    onClick={() => setVisibility('confidential')}
                    className={`p-4 rounded-lg border-2 transition-all ${
                      visibility === 'confidential' 
                        ? 'border-orange-500 bg-orange-50' 
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg ${
                        visibility === 'confidential' ? 'bg-orange-500 text-white' : 'bg-gray-200 text-gray-600'
                      }`}>
                        <Lock className="w-5 h-5" />
                      </div>
                      <div className="text-left">
                        <h6 className="font-semibold text-[#003f5c]">Confidential</h6>
                        <p className="text-xs text-gray-600 mt-1">
                          Shows "Contact student for details" on diploma
                        </p>
                      </div>
                    </div>
                  </button>
                </div>

                {/* Preview Message */}
                <div className={`p-4 rounded-lg ${
                  visibility === 'public' 
                    ? 'bg-blue-50 border border-blue-200' 
                    : 'bg-orange-50 border border-orange-200'
                }`}>
                  <div className="flex items-start gap-3">
                    {visibility === 'public' ? (
                      <Eye className="w-5 h-5 text-blue-600 mt-0.5" />
                    ) : (
                      <EyeOff className="w-5 h-5 text-orange-600 mt-0.5" />
                    )}
                    <div className="text-sm">
                      <p className="font-medium text-gray-800">
                        {visibility === 'public' 
                          ? 'This work will be visible on your public diploma'
                          : 'This work will be marked as confidential'}
                      </p>
                      <p className="text-gray-600 mt-1">
                        {visibility === 'public'
                          ? 'Anyone viewing your diploma can see this work. Make it impressive!'
                          : 'Viewers will see: "📁 Student chose to keep this work confidential. Contact them directly."'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={!workText.trim()}
                className={`w-full py-4 rounded-lg font-semibold transition-all ${
                  workText.trim()
                    ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white hover:shadow-lg transform hover:scale-[1.02]'
                    : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                }`}
              >
                Submit {visibility === 'public' ? 'Publicly' : 'Confidentially'}
              </button>
            </div>
          </div>

          {/* Student Validation Note */}
          <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[#6d469b] mt-0.5" />
              <div>
                <h5 className="font-semibold text-[#003f5c] mb-1">Student Validation</h5>
                <p className="text-sm text-gray-700">
                  You validate your own learning through public accountability. 
                  There's no teacher grading - your work quality is self-evident.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="bg-green-50 border-2 border-green-300 rounded-xl p-8 text-center">
          <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-green-800 mb-2">Work Submitted!</h3>
          <p className="text-green-700">
            Your work for "{currentTask.title}" has been submitted {visibility === 'public' ? 'publicly' : 'confidentially'}.
          </p>
        </div>
      )}

      {/* Accountability Modal */}
      <InfoModal
        isOpen={showAccountabilityModal}
        onClose={() => setShowAccountabilityModal(false)}
        title="Public Accountability = Quality"
      >
        <div className="space-y-4">
          <p className="text-lg font-medium text-gray-800">
            Student validation works because public work creates natural accountability.
          </p>
          
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Globe className="w-5 h-5 text-green-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Public Work</h4>
                <p className="text-sm text-gray-600">
                  When work is visible to colleges, employers, and peers, quality naturally matters.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <Lock className="w-5 h-5 text-orange-500 mt-0.5" />
              <div>
                <h4 className="font-semibold">Confidential Option</h4>
                <p className="text-sm text-gray-600">
                  For sensitive content, mark it confidential. Your diploma shows you completed it, 
                  but viewers must contact you for details.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 rounded-lg p-4">
            <p className="text-sm text-blue-800 font-medium">
              Remember: Poor quality public work reflects on you, not Optio. 
              This creates genuine incentive for excellence.
            </p>
          </div>
        </div>
      </InfoModal>
    </div>
  );
};

export default WorkSubmission;