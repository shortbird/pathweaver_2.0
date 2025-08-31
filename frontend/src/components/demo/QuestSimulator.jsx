import React, { useState, useEffect } from 'react';
import { useDemo } from '../../contexts/DemoContext';
import { 
  Music, Book, Briefcase, Heart, CheckCircle, Upload, 
  Star, Trophy, Sparkles, GraduationCap, Shield, Users
} from 'lucide-react';
import EvidenceSubmission from './EvidenceSubmission';
import VisionaryTierModal from './VisionaryTierModal';

const QuestSimulator = () => {
  const { demoState, demoQuests, actions } = useDemo();
  const [selectedQuest, setSelectedQuest] = useState(null);
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [showEvidence, setShowEvidence] = useState(false);
  const [showVisionaryModal, setShowVisionaryModal] = useState(false);
  
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

  const questIcons = {
    'music-composition': Music,
    'family-recipes': Book,
    'small-business': Briefcase,
    'volunteer-impact': Heart
  };

  const pillarColors = {
    creativity: 'bg-purple-100 text-purple-700',
    critical_thinking: 'bg-blue-100 text-blue-700',
    practical_skills: 'bg-green-100 text-green-700',
    communication: 'bg-orange-100 text-orange-700',
    cultural_literacy: 'bg-pink-100 text-pink-700'
  };

  const handleQuestSelect = (quest) => {
    setSelectedQuest(quest);
    actions.selectQuest(quest.id);
    actions.trackInteraction('quest_selected', { questId: quest.id });
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

  if (!selectedQuest) {
    return (
      <div className="space-y-8">
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
              className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white rounded-full animate-pulse hover:animate-none hover:shadow-lg transition-all"
            >
              <Shield className="w-5 h-5" />
              <span className="font-semibold">Accredited Diploma Available</span>
              <GraduationCap className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Quest Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-5xl mx-auto">
          {demoQuests.map((quest) => {
            const Icon = questIcons[quest.id];
            
            return (
              <button
                key={quest.id}
                onClick={() => handleQuestSelect(quest)}
                className="group relative p-6 bg-white rounded-xl border-2 border-gray-200 
                         hover:border-[#6d469b] hover:shadow-xl transition-all duration-300 text-left"
              >
                {/* Quest Icon */}
                <div className="flex items-start gap-4 mb-4">
                  <div className="p-3 bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-lg group-hover:scale-110 transition-transform">
                    <Icon className="w-8 h-8 text-[#6d469b]" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-xl font-bold text-[#003f5c] mb-1">{quest.title}</h3>
                    <p className="text-sm text-gray-600">{quest.description}</p>
                  </div>
                </div>

                {/* Tasks Preview */}
                <div className="space-y-2 mb-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase">You'll Complete:</p>
                  <div className="flex flex-wrap gap-2">
                    {quest.tasks.map((task, index) => (
                      <div key={index} className="text-xs px-2 py-1 bg-gray-100 rounded-full">
                        {task.title}
                      </div>
                    ))}
                  </div>
                </div>

                {/* XP and Appeal */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-[#FFCA3A]" />
                    <span className="font-bold text-[#003f5c]">{quest.totalXP} XP</span>
                  </div>
                  <p className="text-xs text-gray-500 italic">{quest.appeal}</p>
                </div>

                {/* Hover Effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#6d469b]/5 to-[#ef597b]/5 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" />
              </button>
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
      {/* Quest Header */}
      <div className="bg-gradient-to-r from-[#6d469b]/10 to-[#ef597b]/10 rounded-xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            {React.createElement(questIcons[selectedQuest.id], { 
              className: "w-8 h-8 text-[#6d469b]" 
            })}
            <div>
              <h3 className="text-2xl font-bold text-[#003f5c]">{selectedQuest.title}</h3>
              <p className="text-gray-600">{selectedQuest.description}</p>
            </div>
          </div>
          
          {/* XP Counter */}
          <div className="text-right">
            <div className="text-3xl font-bold text-[#6d469b]">
              {Object.values(demoState.earnedXP).reduce((sum, xp) => sum + xp, 0)}
            </div>
            <div className="text-sm text-gray-600">XP Earned</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-gray-600">
            <span>Progress: {completedTasksCount} of {selectedQuest.tasks.length} tasks</span>
            <span>{Math.round(progress)}% Complete</span>
          </div>
          <div className="h-3 bg-white/50 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-[#6d469b] to-[#ef597b] transition-all duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* Current Task */}
      {currentTask && !showEvidence && (
        <div className="bg-white rounded-xl border-2 border-[#6d469b]/20 p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-semibold text-gray-500">
                  TASK {currentTaskIndex + 1}
                </span>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${pillarColors[currentTask.pillar]}`}>
                  {currentTask.pillar.replace('_', ' ').toUpperCase()}
                </span>
              </div>
              <h4 className="text-xl font-bold text-[#003f5c] mb-2">{currentTask.title}</h4>
            </div>
            
            <div className="text-center">
              <div className="text-2xl font-bold text-[#FFCA3A]">+{currentTask.xp}</div>
              <div className="text-xs text-gray-600">XP</div>
            </div>
          </div>

          <p className="text-gray-600 mb-6">
            Complete this task by submitting evidence of your work. This could be a photo, video, document, or written reflection.
          </p>

          <button
            onClick={() => setShowEvidence(true)}
            className="w-full py-3 bg-gradient-to-r from-[#6d469b] to-[#ef597b] text-white font-semibold rounded-lg hover:shadow-lg transition-all duration-300 flex items-center justify-center gap-2"
          >
            <Upload className="w-5 h-5" />
            Submit Evidence
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
              <span className="flex-1 text-gray-700">{task.title}</span>
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

export default QuestSimulator;