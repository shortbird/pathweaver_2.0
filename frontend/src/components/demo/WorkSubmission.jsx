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

  // Pre-filled demo responses based on task
  const getDemoResponse = () => {
    if (!currentTask) return '';
    
    const responses = {
      'interview': 'I interviewed my grandmother about our family recipes. She shared stories about cooking during the Great Depression and how recipes were passed down through generations. I recorded 2 hours of video and transcribed the most meaningful parts.',
      'document': 'I documented 25 traditional family recipes with step-by-step photos. Each recipe includes the origin story, cultural significance, and tips passed down through generations. The cookbook is organized by meal type and includes a family tree showing which relative contributed each recipe.',
      'test': 'I tested and refined 15 recipes, adjusting ingredients for modern kitchens while preserving authentic flavors. Created video tutorials for complex techniques and documented common mistakes to avoid.',
      'design': 'I designed a 60-page digital cookbook using Canva with custom illustrations and family photos. The book includes QR codes linking to video interviews and a searchable index.',
      'theory': 'I studied music theory fundamentals through Khan Academy and YouTube tutorials. Learned scales, chord progressions, and basic composition techniques. Created flashcards for key concepts.',
      'compose': 'I composed a 3-minute piano piece inspired by my favorite video game soundtrack. Used GarageBand to layer different instruments and experimented with various melodies until I found one that expressed my intended emotion.',
      'record': 'I recorded my composition using my phone and a USB microphone. Did multiple takes to get the timing right and added basic mixing to balance the audio levels.',
      'share': 'I shared my composition on SoundCloud and in our family WhatsApp group. Received feedback from 12 people and incorporated suggestions into a revised version.',
      'research': 'I researched the local dog walking market by surveying 20 neighbors and analyzing 5 competitor services. Found that reliability and trust are the top concerns for pet owners.',
      'plan': 'I created a business plan including pricing strategy ($15 per 30-min walk), service area (2-mile radius), and safety protocols. Projected break-even after 10 regular clients.',
      'build': 'I built a simple booking system using Google Forms and Calendar. Created business cards and flyers with QR codes linking to my booking page.',
      'customer': 'I got my first paying customer through a neighborhood Facebook group. Successfully completed 5 walks and received a 5-star review and a referral.',
      'choose': 'I chose to volunteer at the local food bank after researching various causes. This aligned with my interest in addressing food insecurity in our community.',
      'serve': 'I completed 22 hours of service over 6 weeks, helping sort donations, pack food boxes, and assist with distribution to 200+ families.',
      'report': 'I created a visual impact report showing how my 22 hours helped provide 1,100 meals. Included photos, volunteer testimonials, and suggestions for improving operations.'
    };
    
    return responses[currentTask.id] || 'I completed this task by putting in genuine effort and documenting my process thoroughly. The experience taught me valuable skills that I can apply in future projects.';
  };

  // Set demo response when task changes
  React.useEffect(() => {
    if (currentTask && !workText) {
      setWorkText(getDemoResponse());
    }
  }, [currentTask?.id]);

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
        <h2 className="text-3xl font-bold text-text-primary">
          Submit Your Work
        </h2>
        <p className="text-gray-600">
          Share what you've created - publicly or confidentially
        </p>
      </div>

      {/* Quest/Task Selector */}
      <div className="bg-gradient-to-r from-[#ef597b]/10 to-[#6d469b]/10 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-bold text-lg text-text-primary">{currentQuest.title}</h3>
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
                    ? 'bg-gradient-to-r bg-gradient-primary-reverse text-white shadow-lg' 
                    : isSubmitted
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-white text-gray-600 border border-gray-200 hover:border-optio-purple'
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
            <h4 className="font-bold text-lg text-text-primary mb-2">
              Task: {currentTask.title}
            </h4>
            <p className="text-gray-600 mb-4">
              Submit your work for this task. Remember, quality matters when it's public!
            </p>

            {/* Submission Type Selector */}
            <div className="mb-6">
              <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Submission Types (Full Version Only)</p>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {submissionTypes.map((type, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col items-center gap-2 p-3 bg-gray-100 rounded-lg opacity-50 cursor-not-allowed relative"
                  >
                    <div className="text-gray-400">{type.icon}</div>
                    <span className="text-xs text-gray-500">{type.label}</span>
                    {idx === 0 && (
                      <div className="absolute top-1 right-1 bg-optio-purple text-white text-[10px] px-2 py-0.5 rounded-full">
                        Demo
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-600 mt-2 italic">
                Demo uses text descriptions only. Full version supports images, videos, and documents.
              </p>
            </div>

            {/* Work Input */}
            <div className="space-y-4">
              <label className="block">
                <span className="text-sm font-medium text-gray-700 mb-1 block">
                  Your work description (pre-filled for demo)
                </span>
                <textarea
                  value={workText}
                  onChange={(e) => setWorkText(e.target.value)}
                  className="w-full p-4 border-2 border-gray-200 rounded-lg focus:border-optio-purple focus:outline-none transition-colors bg-blue-50"
                  rows="5"
                />
                <p className="text-xs text-gray-500 mt-1">
                  This is a demo response. In the full version, you'll write your own.
                </p>
              </label>

              {/* Visibility Toggle */}
              <div className="bg-gray-50 rounded-xl p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h5 className="font-semibold text-text-primary">Visibility Settings</h5>
                  <button
                    onClick={() => setShowAccountabilityModal(true)}
                    className="text-sm text-optio-purple hover:underline flex items-center gap-1"
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
                        <h6 className="font-semibold text-text-primary">Public (Recommended)</h6>
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
                        <h6 className="font-semibold text-text-primary">Confidential</h6>
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
                          : 'Viewers will see: "Student chose to keep this work confidential. Contact them directly."'}
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
                    ? 'bg-gradient-to-r bg-gradient-primary-reverse text-white hover:shadow-lg transform hover:scale-[1.02]'
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
              <AlertCircle className="w-5 h-5 text-optio-purple mt-0.5" />
              <div>
                <h5 className="font-semibold text-text-primary mb-1">Student Validation</h5>
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