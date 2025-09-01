import React, { useState, useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { 
  Music, Book, Briefcase, Heart, CheckCircle, Upload, 
  Star, Trophy, Sparkles, GraduationCap, Shield, Users,
  ArrowRight, FileText, Camera, PenTool, Info, X
} from 'lucide-react';
import EvidenceSubmission from './EvidenceSubmission';
import VisionaryTierModal from './VisionaryTierModal';

const QuestSimulatorRedesigned = () => {
  const { demoState, demoQuests, actions } = useDemo();
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showVisionaryModal, setShowVisionaryModal] = useState(false);
  const [showInstructions, setShowInstructions] = useState(true);
  
  const isParent = demoState.persona === 'parent';

  useEffect(() => {
    // Show Visionary modal for parents after 2 seconds
    if (isParent && !demoState.showAccreditedOption) {
      const timer = setTimeout(() => {
        setShowVisionaryModal(true);
        actions.showVisionaryTier();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [isParent]);

  const pillarColors = {
    creativity: { gradient: 'from-purple-500 to-pink-500', bg: 'bg-purple-100', text: 'text-purple-700' },
    critical_thinking: { gradient: 'from-blue-500 to-cyan-500', bg: 'bg-blue-100', text: 'text-blue-700' },
    practical_skills: { gradient: 'from-green-500 to-emerald-500', bg: 'bg-green-100', text: 'text-green-700' },
    communication: { gradient: 'from-orange-500 to-yellow-500', bg: 'bg-orange-100', text: 'text-orange-700' },
    cultural_literacy: { gradient: 'from-red-500 to-rose-500', bg: 'bg-red-100', text: 'text-red-700' }
  };

  const handleQuestSelect = (quest) => {
    setSelectedQuest(quest);
    actions.selectQuest(quest.id);
    actions.trackInteraction('quest_selected', { questId: quest.id });
    setShowInstructions(false);
  };

  const handleTaskComplete = (taskId, evidence) => {
    actions.completeTask(taskId, evidence);
    
    // Move to next task or complete quest
    if (currentTaskIndex < selectedQuest.tasks.length - 1) {
      setCurrentTaskIndex(currentTaskIndex + 1);
      setShowEvidence(false);
    } else {
      // All tasks completed
      setTimeout(() => {
        actions.generateDiploma();
        actions.nextStep();
      }, 1500);
    }
  };

  const currentTask = selectedQuest?.tasks[currentTaskIndex];
  const completedTasksCount = demoState.completedTasks.length;
  const progress = selectedQuest ? (completedTasksCount / selectedQuest.tasks.length) * 100 : 0;

  // Quest Selection View
  if (!selectedQuest) {
    return (
      <div className="space-y-8">
        {/* Instructions Panel */}
        {showInstructions && (
          <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6 relative">
            <button
              onClick={() => setShowInstructions(false)}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
            
            <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
              <Info className="w-5 h-5" />
              How Quests Work
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-900 font-bold">
                  1
                </div>
                <div>
                  <h4 className="font-semibold text-blue-900">Choose a Quest</h4>
                  <p className="text-sm text-blue-700">Pick something you're passionate about</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-900 font-bold">
                  2
                </div>
                <div>
                  <h4 className="font-semibold text-blue-900">Complete Tasks</h4>
                  <p className="text-sm text-blue-700">Each quest has multiple tasks to complete across different subjects</p>
                </div>
              </div>
              
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-900 font-bold">
                  3
                </div>
                <div>
                  <h4 className="font-semibold text-blue-900">Submit Evidence</h4>
                  <p className="text-sm text-blue-700">Upload proof of your work for each task</p>
                </div>
              </div>
            </div>
            
            <p className="text-sm text-blue-600 mt-4 italic">
              💡 Demo uses example files, but real students upload their actual work!
            </p>
          </div>
        )}

        {/* Header */}
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-[#003f5c]">
            {isParent ? "See How Your Child Would Learn" : "Choose Your First Quest"}
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            {isParent 
              ? "These are real quests that turn everyday activities into academic achievements"
              : "Pick something you're already passionate about - we'll show you how it becomes academic credit"}
          </p>
          
          {/* Visionary Tier Badge for Parents */}
          {isParent && demoState.showAccreditedOption && (
            <button
              onClick={() => setShowVisionaryModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white rounded-full animate-pulse hover:animate-none hover:shadow-lg transition-all"
            >
              <Shield className="w-5 h-5" />
              <span className="font-semibold">Accredited Diploma Available</span>
              <GraduationCap className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Quest Cards - Matching Real Design */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {demoQuests.map((quest) => {
            // Calculate pillar breakdown
            const pillarBreakdown = {};
            quest.tasks.forEach(task => {
              pillarBreakdown[task.pillar] = (pillarBreakdown[task.pillar] || 0) + task.xp;
            });
            
            const dominantPillar = Object.entries(pillarBreakdown).reduce((max, [pillar, xp]) => 
              xp > (max.xp || 0) ? { pillar, xp } : max, {}).pillar || 'creativity';
            
            return (
              <div 
                key={quest.id}
                className="group bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 border border-gray-100"
                onClick={() => handleQuestSelect(quest)}
              >
                {/* Visual Header */}
                <div className={`h-2 bg-gradient-to-r ${pillarColors[dominantPillar].gradient}`} />
                
                {/* Content Section */}
                <div className="p-6">
                  {/* Title and Description */}
                  <div className="mb-4">
                    <h3 className="text-xl font-bold text-gray-900 mb-2 group-hover:text-[#6d469b] transition-colors">
                      {quest.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed">
                      {quest.description}
                    </p>
                  </div>

                  {/* Meta Information */}
                  <div className="flex items-center gap-4 mb-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                      </svg>
                      <span className="text-gray-600">{quest.tasks.length} Tasks</span>
                    </div>
                  </div>

                  {/* XP Display */}
                  <div className="mb-5">
                    {/* Total XP Badge */}
                    <div className="flex items-center gap-2 mb-3">
                      <div className={`px-3 py-1.5 rounded-full bg-gradient-to-r ${pillarColors[dominantPillar].gradient} text-white text-sm font-bold shadow-md`}>
                        {quest.totalXP} Total XP
                      </div>
                    </div>
                    
                    {/* Pillar Breakdown */}
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(pillarBreakdown)
                        .filter(([_, xp]) => xp > 0)
                        .sort(([_, a], [__, b]) => b - a)
                        .map(([pillar, xp]) => (
                          <div 
                            key={pillar}
                            className={`inline-flex items-center gap-1 px-2 py-1 rounded-md ${pillarColors[pillar]?.bg || 'bg-gray-100'} ${pillarColors[pillar]?.text || 'text-gray-700'} text-xs font-medium`}
                          >
                            <span className="capitalize">{pillar.replace('_', ' ')}</span>
                            <span className="font-bold">+{xp}</span>
                          </div>
                        ))}
                    </div>
                  </div>

                  {/* Appeal Text */}
                  <p className="text-xs text-gray-500 italic mb-4">{quest.appeal}</p>

                  {/* Start Button */}
                  <button className="w-full py-2.5 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white font-semibold rounded-lg hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2">
                    Start Quest
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Visionary Modal */}
        {showVisionaryModal && (
          <VisionaryTierModal onClose={() => setShowVisionaryModal(false)} />
        )}
      </div>
    );
  }

  // Quest in Progress View
  return (
    <div className="space-y-6">
      {/* Quest Header with Clear Structure */}
      <div className="bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6">
        <div className="mb-4">
          <div className="flex items-center gap-2 text-sm text-gray-600 mb-2">
            <span className="font-semibold">QUEST:</span>
            <span>{selectedQuest.title}</span>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-600">{selectedQuest.description}</p>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-[#6d469b]">
                {Object.values(demoState.earnedXP).reduce((sum, xp) => sum + xp, 0)} / {selectedQuest.totalXP}
              </div>
              <div className="text-sm text-gray-600">XP Earned</div>
            </div>
          </div>
        </div>

        {/* Task Progress Visualization */}
        <div className="space-y-3">
          <div className="flex items-center justify-between text-sm text-gray-600">
            <span>Task Progress</span>
            <span>{completedTasksCount} of {selectedQuest.tasks.length} completed</span>
          </div>
          
          {/* Task Dots */}
          <div className="flex gap-2">
            {selectedQuest.tasks.map((task, index) => (
              <div key={task.id} className="flex-1">
                <div className={`h-2 rounded-full transition-all duration-500 ${
                  index < completedTasksCount 
                    ? 'bg-gradient-to-r from-[#ef597b] to-[#6d469b]'
                    : index === completedTasksCount
                    ? 'bg-[#6d469b]/30 animate-pulse'
                    : 'bg-gray-200'
                }`} />
                <p className="text-xs text-gray-600 mt-1 truncate">{task.title}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Current Task Card */}
      {currentTask && !showEvidence && (
        <div className="bg-white rounded-xl border-2 border-[#6d469b]/20 p-6">
          {/* Task Header */}
          <div className="border-b border-gray-200 pb-4 mb-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <span className="px-3 py-1 bg-[#6d469b]/10 text-[#6d469b] text-sm font-bold rounded-full">
                    Task {currentTaskIndex + 1} of {selectedQuest.tasks.length}
                  </span>
                  <span className={`px-3 py-1 rounded-full text-xs font-semibold ${pillarColors[currentTask.pillar].bg} ${pillarColors[currentTask.pillar].text}`}>
                    {currentTask.pillar.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <h4 className="text-xl font-bold text-[#003f5c]">{currentTask.title}</h4>
              </div>
              
              <div className="text-center">
                <div className="text-2xl font-bold text-[#FFCA3A]">+{currentTask.xp}</div>
                <div className="text-xs text-gray-600">XP Reward</div>
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <h5 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
              <Info className="w-4 h-4" />
              How to Complete This Task
            </h5>
            <ol className="space-y-2 text-sm text-blue-700">
              <li className="flex gap-2">
                <span className="font-bold">1.</span>
                Complete the task in real life (in the demo, we'll use example files)
              </li>
              <li className="flex gap-2">
                <span className="font-bold">2.</span>
                Document your work with photos, videos, or written reflections
              </li>
              <li className="flex gap-2">
                <span className="font-bold">3.</span>
                Submit your evidence to earn XP
              </li>
            </ol>
          </div>

          {/* Evidence Types */}
          <div className="mb-6">
            <p className="text-sm text-gray-600 mb-3">Accepted Evidence Types:</p>
            <div className="flex gap-3">
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
                <Camera className="w-4 h-4 text-gray-600" />
                <span className="text-sm">Photos</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
                <FileText className="w-4 h-4 text-gray-600" />
                <span className="text-sm">Documents</span>
              </div>
              <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg">
                <PenTool className="w-4 h-4 text-gray-600" />
                <span className="text-sm">Written Reflection</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => setShowEvidence(true)}
            className="w-full py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white font-semibold rounded-lg hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Submit Evidence for This Task
          </button>
        </div>
      )}

      {/* Evidence Submission */}
      {showEvidence && currentTask && (
        <EvidenceSubmission 
          task={currentTask}
          onSubmit={(evidence) => handleTaskComplete(currentTask.id, evidence)}
          onBack={() => setShowEvidence(false)}
        />
      )}

      {/* Completed Tasks */}
      {completedTasksCount > 0 && (
        <div className="space-y-3">
          <h4 className="font-semibold text-gray-700">Completed Tasks</h4>
          {selectedQuest.tasks.slice(0, completedTasksCount).map((task, index) => (
            <div key={task.id} className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <CheckCircle className="w-5 h-5 text-green-600" />
              <span className="flex-1 text-gray-700">
                Task {index + 1}: {task.title}
              </span>
              <span className="text-green-600 font-semibold">+{task.xp} XP</span>
            </div>
          ))}
        </div>
      )}

      {/* Completion Message */}
      {progress === 100 && (
        <div className="text-center p-8 bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl">
          <Sparkles className="w-16 h-16 text-[#FFCA3A] mx-auto mb-4" />
          <h3 className="text-2xl font-bold text-[#003f5c] mb-2">Quest Complete!</h3>
          <p className="text-lg text-gray-600 mb-4">
            You've earned {Object.values(demoState.earnedXP).reduce((sum, xp) => sum + xp, 0)} XP
          </p>
          <p className="text-gray-500">Generating your diploma...</p>
        </div>
      )}
    </div>
  );
};

export default QuestSimulatorRedesigned;