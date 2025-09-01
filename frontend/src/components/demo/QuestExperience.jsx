import React, { useState, useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { 
  CheckCircle, Upload, Star, Trophy, Sparkles, GraduationCap, Shield,
  ArrowRight, FileText, Camera, PenTool, Info, X, AlertCircle
} from 'lucide-react';
import AcademyTierModal from './VisionaryTierModal';

const QuestExperience = () => {
  const { demoState, demoQuests, actions } = useDemo();
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [showAcademyModal, setShowAcademyModal] = useState(false);
  const [currentSubmittingTask, setCurrentSubmittingTask] = useState(null);
  const [xpAnimation, setXpAnimation] = useState(null);
  const [showCompletionBonus, setShowCompletionBonus] = useState(false);
  
  const isParent = demoState.persona === 'parent';

  useEffect(() => {
    // Show Academy modal for parents after 2 seconds
    if (isParent && !demoState.showAccreditedOption) {
      const timer = setTimeout(() => {
        setShowAcademyModal(true);
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
    // Scroll to top when quest is selected
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleTaskSubmit = (task) => {
    // Simulate evidence submission
    setCurrentSubmittingTask(task.id);
    
    setTimeout(() => {
      setCompletedTasks([...completedTasks, task.id]);
      actions.completeTask(task.id, { type: 'demo', text: 'Sample evidence provided' });
      setCurrentSubmittingTask(null);
      
      // Show XP animation
      setXpAnimation({ taskId: task.id, xp: task.xp });
      setTimeout(() => setXpAnimation(null), 2000);
      
      // Don't automatically show bonus alert - user controls navigation
    }, 1000);
  };

  // Quest Selection View
  if (!selectedQuest) {
    return (
      <div className="space-y-8">
        {/* Header */}
        <div className="text-center space-y-4">
          <h2 className="text-3xl font-bold text-[#003f5c]">
            {isParent ? "Learners Choose Their Quests" : "Choose Your First Quest"}
          </h2>
          <p className="text-lg text-gray-600 max-w-2xl mx-auto">
            {isParent 
              ? "These are real quests that turn everyday activities into academic achievements"
              : "Pick something you're already passionate about - we'll show you how it becomes academic credit"}
          </p>
        </div>

        {/* Quest Cards */}
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
                    <h3 className="text-2xl font-bold text-gray-900 mb-2 group-hover:text-[#6d469b] transition-colors">
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

        {/* Academy Modal */}
        {showAcademyModal && (
          <AcademyTierModal onClose={() => setShowAcademyModal(false)} />
        )}
      </div>
    );
  }

  // Quest Task List View
  return (
    <div className="space-y-6">
      {/* Instructions Panel at the top */}
      <div className="bg-blue-50 border-2 border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-bold text-blue-900 mb-4 flex items-center gap-2">
          How to Complete This Quest
        </h3>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-900 font-bold">
              1
            </div>
            <div>
              <h4 className="font-semibold text-blue-900">Review Tasks</h4>
              <p className="text-sm text-blue-700">See all the tasks for this quest below</p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-900 font-bold">
              2
            </div>
            <div>
              <h4 className="font-semibold text-blue-900">Submit Evidence</h4>
              <p className="text-sm text-blue-700">Click "Submit Evidence" for each task</p>
            </div>
          </div>
          
          <div className="flex gap-3">
            <div className="flex-shrink-0 w-10 h-10 bg-blue-200 rounded-full flex items-center justify-center text-blue-900 font-bold">
              3
            </div>
            <div>
              <h4 className="font-semibold text-blue-900">Earn Your Diploma</h4>
              <p className="text-sm text-blue-700">Complete all tasks to generate your diploma</p>
            </div>
          </div>
        </div>
        
        <div className="bg-yellow-100 border border-yellow-300 rounded-lg p-3 flex items-start gap-2">
          <AlertCircle className="w-5 h-5 text-yellow-700 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-yellow-800 font-semibold">Demo Mode</p>
            <p className="text-sm text-yellow-700">
              We'll provide sample files for this demo. In the real platform, students upload their actual work.
            </p>
          </div>
        </div>
      </div>

      {/* Quest Header */}
      <div className="bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-bold text-[#003f5c] mb-2">{selectedQuest.title}</h2>
            <p className="text-gray-600">{selectedQuest.description}</p>
          </div>
          <div className="text-right">
            <div className="text-3xl font-bold text-[#6d469b]">
              {selectedQuest.totalXP}
            </div>
            <div className="text-sm text-gray-600">Total XP</div>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xl font-bold text-[#003f5c]">Quest Tasks</h3>
          <button
            onClick={() => {
              setSelectedQuest(null);
              setCompletedTasks([]);
              setShowCompletionBonus(false);
              // Scroll to top when going back to quest selection
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg transition-all duration-300"
          >
            <ArrowRight className="w-4 h-4 rotate-180" />
            Back to Quest Selection
          </button>
        </div>
        
        {selectedQuest.tasks.map((task, index) => {
          const isCompleted = completedTasks.includes(task.id);
          const isSubmitting = currentSubmittingTask === task.id;
          
          return (
            <div 
              key={task.id} 
              className={`bg-white rounded-lg border-2 p-4 transition-all duration-300 ${
                isCompleted 
                  ? 'border-green-500 bg-green-50' 
                  : 'border-gray-200 hover:border-[#6d469b]/50'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="px-2 py-1 bg-[#6d469b]/10 text-[#6d469b] text-xs font-bold rounded">
                      Task {index + 1}
                    </span>
                    <span className={`px-2 py-1 rounded text-xs font-semibold ${pillarColors[task.pillar].bg} ${pillarColors[task.pillar].text}`}>
                      {task.pillar.replace('_', ' ').toUpperCase()}
                    </span>
                    <span className="text-sm font-bold text-[#FFCA3A]">
                      +{task.xp} XP
                    </span>
                  </div>
                  
                  <h4 className="text-lg font-semibold text-[#003f5c] mb-1">
                    {task.title}
                  </h4>
                  
                  {task.description && (
                    <p className="text-sm text-gray-600">
                      {task.description}
                    </p>
                  )}
                </div>
                
                <div className="flex-shrink-0">
                  {isCompleted ? (
                    <div className="flex items-center gap-2 px-4 py-2 bg-green-500 text-white rounded-lg">
                      <CheckCircle className="w-5 h-5" />
                      <span className="font-semibold">Completed</span>
                    </div>
                  ) : isSubmitting ? (
                    <div className="flex items-center gap-2 px-4 py-2 bg-[#6d469b] text-white rounded-lg">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      <span className="font-semibold">Submitting...</span>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleTaskSubmit(task)}
                      className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white font-semibold rounded-lg hover:shadow-lg transition-all duration-300"
                    >
                      <Upload className="w-5 h-5" />
                      Submit Evidence
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress Summary */}
      <div className="bg-gray-50 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy className="w-5 h-5 text-[#FFCA3A]" />
            <span className="text-sm text-gray-600">Progress:</span>
            <span className="font-semibold text-[#003f5c]">
              {completedTasks.length} of {selectedQuest.tasks.length} tasks completed
            </span>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="text-2xl font-bold text-[#6d469b]">
                {Object.values(demoState.earnedXP).reduce((sum, xp) => sum + xp, 0)}
              </div>
              <div className="text-xs text-gray-600">Total XP</div>
            </div>
            {completedTasks.length === selectedQuest.tasks.length && (
              <button
                onClick={() => setShowCompletionBonus(true)}
                className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white font-semibold rounded-lg hover:shadow-lg transition-all duration-300"
              >
                <Sparkles className="w-5 h-5" />
                <span>View Completion Bonus</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
      
      {/* XP Animation Overlay */}
      {xpAnimation && (
        <div className="fixed inset-0 pointer-events-none flex items-center justify-center z-50">
          <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white px-8 py-4 rounded-full shadow-2xl animate-bounce">
            <span className="text-3xl font-bold">+{xpAnimation.xp} XP!</span>
          </div>
        </div>
      )}
      
      {/* Completion Bonus Alert */}
      {showCompletionBonus && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-8 max-w-md shadow-2xl">
            <div className="text-center space-y-4">
              <Trophy className="w-16 h-16 text-[#FFCA3A] mx-auto" />
              <h3 className="text-2xl font-bold text-[#003f5c]">Quest Complete!</h3>
              <p className="text-gray-600">
                Congratulations! You've completed all tasks and earned a
              </p>
              <div className="bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white py-3 px-6 rounded-lg inline-block">
                <span className="text-xl font-bold">50% XP BONUS!</span>
              </div>
              <p className="text-sm text-gray-500">
                Total XP earned: {Math.round(selectedQuest.totalXP * 1.5)}
              </p>
              <div className="space-y-3">
                <button
                  onClick={() => {
                    actions.generateDiploma();
                    actions.nextStep();
                  }}
                  className="w-full py-3 bg-gradient-to-r from-[#ef597b] to-[#6d469b] text-white font-semibold rounded-lg hover:shadow-lg transition-all duration-300"
                >
                  View Your Diploma
                </button>
                <button
                  onClick={() => {
                    setSelectedQuest(null);
                    setCompletedTasks([]);
                    setShowCompletionBonus(false);
                    // Scroll to top when going back to quest selection
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="w-full py-3 bg-white border-2 border-[#6d469b] text-[#6d469b] font-semibold rounded-lg hover:bg-[#6d469b]/5 transition-all duration-300"
                >
                  Complete Another Quest
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default QuestExperience;