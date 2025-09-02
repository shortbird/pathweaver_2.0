import React, { createContext, useContext, useState, useCallback } from 'react';

const DemoContext = createContext();

export const useDemo = () => {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
};

const DEMO_QUESTS = [
  {
    id: 'music-composition',
    title: 'Create an Original Music Composition',
    description: 'Compose and perform your own original piece of music',
    tasks: [
      { id: 'theory', title: 'Learn music theory basics', pillar: 'critical_thinking', xp: 75 },
      { id: 'compose', title: 'Compose your piece', pillar: 'creativity', xp: 100 },
      { id: 'record', title: 'Record your performance', pillar: 'practical_skills', xp: 75 },
      { id: 'share', title: 'Share with community', pillar: 'communication', xp: 50 },
    ],
    totalXP: 300,
    appeal: 'Perfect for students with creative passions'
  },
  {
    id: 'family-recipes',
    title: "Build Your Family's Recipe Book",
    description: 'Document and preserve your family culinary traditions',
    tasks: [
      { id: 'interview', title: 'Interview family members', pillar: 'communication', xp: 75 },
      { id: 'document', title: 'Document recipes', pillar: 'cultural_literacy', xp: 100 },
      { id: 'test', title: 'Test cooking recipes', pillar: 'practical_skills', xp: 100 },
      { id: 'design', title: 'Design digital book', pillar: 'creativity', xp: 75 },
    ],
    totalXP: 350,
    appeal: 'Turns family activities into academic credit'
  },
  {
    id: 'small-business',
    title: 'Start a Small Business',
    description: 'Launch your own entrepreneurial venture',
    tasks: [
      { id: 'research', title: 'Market research', pillar: 'cultural_literacy', xp: 100 },
      { id: 'plan', title: 'Create business plan', pillar: 'communication', xp: 100 },
      { id: 'build', title: 'Build product/service', pillar: 'practical_skills', xp: 100 },
      { id: 'customer', title: 'Get first customer', pillar: 'cultural_literacy', xp: 100 },
    ],
    totalXP: 400,
    appeal: 'Real entrepreneurship experience'
  },
  {
    id: 'volunteer-impact',
    title: 'Document Your Volunteer Impact',
    description: 'Showcase your community service and its real impact',
    tasks: [
      { id: 'choose', title: 'Choose your cause', pillar: 'critical_thinking', xp: 75 },
      { id: 'serve', title: 'Complete 20 hours service', pillar: 'practical_skills', xp: 100 },
      { id: 'interview', title: 'Interview beneficiaries', pillar: 'communication', xp: 100 },
      { id: 'report', title: 'Create impact report', pillar: 'cultural_literacy', xp: 75 },
    ],
    totalXP: 350,
    appeal: 'Validates community service already being done'
  }
];

const initialState = {
  persona: null,
  showAccreditedOption: false,
  currentStep: 0,
  selectedQuest: null,
  selectedQuests: [], // For multiple quest starts
  completedTasks: [],
  earnedXP: {
    creativity: 0,
    critical_thinking: 0,
    practical_skills: 0,
    communication: 0,
    cultural_literacy: 0
  },
  userInputs: {
    name: '',
    learnerName: '',
    interests: []
  },
  generatedDiploma: null,
  subscriptionTier: 'free',
  demoStartTime: null,
  interactions: [],
  // Modal states
  modals: {
    studentValidation: false,
    questLibrary: false,
    publicAccountability: false,
    processPhilosophy: false,
    teacherComparison: false
  },
  // Work submission states
  submittedWork: [],
  workVisibility: {} // questId -> { taskId: 'public' | 'confidential' }
};

export const DemoProvider = ({ children }) => {
  const [demoState, setDemoState] = useState(initialState);

  const selectPersona = useCallback((persona) => {
    setDemoState(prev => ({
      ...prev,
      persona,
      showAccreditedOption: persona === 'parent',
      currentStep: 1,
      demoStartTime: Date.now()
    }));
  }, []);

  const selectQuest = useCallback((questId) => {
    const quest = DEMO_QUESTS.find(q => q.id === questId);
    setDemoState(prev => ({
      ...prev,
      selectedQuest: quest,
      currentStep: 3
    }));
  }, []);

  const completeTask = useCallback((taskId, evidence) => {
    setDemoState(prev => {
      const task = prev.selectedQuest?.tasks.find(t => t.id === taskId);
      if (!task) return prev;

      const newCompletedTasks = [...prev.completedTasks, { taskId, evidence, timestamp: Date.now() }];
      const newEarnedXP = { ...prev.earnedXP };
      newEarnedXP[task.pillar] += task.xp;

      // Check if all tasks completed for bonus
      const allTasksCompleted = prev.selectedQuest.tasks.every(t => 
        newCompletedTasks.some(ct => ct.taskId === t.id)
      );

      if (allTasksCompleted) {
        // Add 50% completion bonus distributed across pillars
        const bonusXP = Math.round(prev.selectedQuest.totalXP * 0.5);
        const pillarsUsed = [...new Set(prev.selectedQuest.tasks.map(t => t.pillar))];
        const bonusPerPillar = Math.round(bonusXP / pillarsUsed.length);
        
        pillarsUsed.forEach(pillar => {
          newEarnedXP[pillar] += bonusPerPillar;
        });
      }

      return {
        ...prev,
        completedTasks: newCompletedTasks,
        earnedXP: newEarnedXP
      };
    });
  }, []);

  const generateDiploma = useCallback(() => {
    const diploma = {
      name: demoState.userInputs.name || demoState.userInputs.learnerName || 'Demo Learner',
      completedQuest: demoState.selectedQuest,
      earnedXP: demoState.earnedXP,
      totalXP: Object.values(demoState.earnedXP).reduce((sum, xp) => sum + xp, 0),
      timestamp: Date.now(),
      isAccredited: demoState.subscriptionTier === 'academy'
    };

    setDemoState(prev => ({
      ...prev,
      generatedDiploma: diploma
    }));

    return diploma;
  }, [demoState]);

  const showVisionaryTier = useCallback(() => {
    setDemoState(prev => ({
      ...prev,
      subscriptionTier: 'academy',
      showAccreditedOption: true
    }));
  }, []);

  const nextStep = useCallback(() => {
    setDemoState(prev => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, 6)
    }));
  }, []);

  const previousStep = useCallback(() => {
    setDemoState(prev => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 0)
    }));
  }, []);

  const resetDemo = useCallback(() => {
    setDemoState(initialState);
  }, []);

  const trackInteraction = useCallback((action, data = {}) => {
    setDemoState(prev => ({
      ...prev,
      interactions: [...prev.interactions, {
        action,
        data,
        timestamp: Date.now(),
        step: prev.currentStep
      }]
    }));
  }, []);

  // Modal management
  const openModal = useCallback((modalName) => {
    setDemoState(prev => ({
      ...prev,
      modals: { ...prev.modals, [modalName]: true }
    }));
  }, []);

  const closeModal = useCallback((modalName) => {
    setDemoState(prev => ({
      ...prev,
      modals: { ...prev.modals, [modalName]: false }
    }));
  }, []);

  // Multiple quest selection
  const toggleQuestSelection = useCallback((questId) => {
    setDemoState(prev => {
      const quest = DEMO_QUESTS.find(q => q.id === questId);
      const isSelected = prev.selectedQuests.some(q => q.id === questId);
      
      if (isSelected) {
        return {
          ...prev,
          selectedQuests: prev.selectedQuests.filter(q => q.id !== questId)
        };
      } else if (prev.selectedQuests.length < 4) { // Limit to 4 quests
        return {
          ...prev,
          selectedQuests: [...prev.selectedQuests, quest]
        };
      }
      return prev;
    });
  }, []);

  // Work submission with visibility
  const submitWork = useCallback((questId, taskId, work, visibility = 'public') => {
    setDemoState(prev => ({
      ...prev,
      submittedWork: [...prev.submittedWork, {
        questId,
        taskId,
        work,
        visibility,
        timestamp: Date.now()
      }],
      workVisibility: {
        ...prev.workVisibility,
        [questId]: {
          ...prev.workVisibility[questId],
          [taskId]: visibility
        }
      }
    }));
  }, []);

  const value = {
    demoState,
    demoQuests: DEMO_QUESTS,
    actions: {
      selectPersona,
      selectQuest,
      toggleQuestSelection,
      completeTask,
      submitWork,
      generateDiploma,
      showVisionaryTier,
      nextStep,
      previousStep,
      resetDemo,
      trackInteraction,
      openModal,
      closeModal
    }
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
};