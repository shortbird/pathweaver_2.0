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
      { id: 'theory', title: 'Learn music theory basics', pillar: 'stem', xp: 75 },
      { id: 'compose', title: 'Compose your piece', pillar: 'art', xp: 100 },
      { id: 'record', title: 'Record your performance', pillar: 'art', xp: 75 },
      { id: 'share', title: 'Share with community', pillar: 'communication', xp: 50 },
    ],
    totalXP: 300,
    appeal: 'Perfect for students with creative passions',
    pillars: ['stem', 'art', 'communication']
  },
  {
    id: 'family-recipes',
    title: "Build Your Family's Recipe Book",
    description: 'Document and preserve your family culinary traditions',
    tasks: [
      { id: 'interview', title: 'Interview family members', pillar: 'communication', xp: 75 },
      { id: 'document', title: 'Document recipes', pillar: 'civics', xp: 100 },
      { id: 'test', title: 'Test cooking recipes', pillar: 'wellness', xp: 100 },
      { id: 'design', title: 'Design digital book', pillar: 'art', xp: 75 },
    ],
    totalXP: 350,
    appeal: 'Turns family activities into academic credit',
    pillars: ['communication', 'civics', 'wellness', 'art']
  },
  {
    id: 'small-business',
    title: 'Start a Small Business',
    description: 'Launch your own entrepreneurial venture',
    tasks: [
      { id: 'research', title: 'Market research', pillar: 'civics', xp: 100 },
      { id: 'plan', title: 'Create business plan', pillar: 'communication', xp: 100 },
      { id: 'build', title: 'Build product/service', pillar: 'stem', xp: 100 },
      { id: 'customer', title: 'Get first customer', pillar: 'communication', xp: 100 },
    ],
    totalXP: 400,
    appeal: 'Real entrepreneurship experience',
    pillars: ['civics', 'communication', 'stem']
  },
  {
    id: 'volunteer-impact',
    title: 'Document Your Volunteer Impact',
    description: 'Showcase your community service and its real impact',
    tasks: [
      { id: 'choose', title: 'Choose your cause', pillar: 'civics', xp: 75 },
      { id: 'serve', title: 'Complete 20 hours service', pillar: 'wellness', xp: 100 },
      { id: 'interview', title: 'Interview beneficiaries', pillar: 'communication', xp: 100 },
      { id: 'report', title: 'Create impact report', pillar: 'communication', xp: 75 },
    ],
    totalXP: 350,
    appeal: 'Validates community service already being done',
    pillars: ['civics', 'wellness', 'communication']
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
    stem: 0,
    wellness: 0,
    communication: 0,
    civics: 0,
    art: 0
  },
  unlockedBadges: [], // NEW: Track badge unlocks in demo
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
  workVisibility: {}, // questId -> { taskId: 'public' | 'confidential' }
  // NEW: Mini-quest experience state
  miniQuestCompleted: false,
  simulatedTaskCompleted: false
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

  // NEW: Complete simulated mini-quest task
  const completeSimulatedTask = useCallback((pillar, xp) => {
    setDemoState(prev => ({
      ...prev,
      simulatedTaskCompleted: true,
      earnedXP: {
        ...prev.earnedXP,
        [pillar]: prev.earnedXP[pillar] + xp
      }
    }));
  }, []);

  // NEW: Unlock badge
  const unlockBadge = useCallback((badgeData) => {
    setDemoState(prev => ({
      ...prev,
      unlockedBadges: [...prev.unlockedBadges, badgeData]
    }));
  }, []);

  // NEW: Calculate total XP
  const calculateTotalXP = useCallback(() => {
    return Object.values(demoState.earnedXP).reduce((sum, xp) => sum + xp, 0);
  }, [demoState.earnedXP]);

  const value = {
    demoState,
    demoQuests: DEMO_QUESTS,
    actions: {
      selectPersona,
      selectQuest,
      toggleQuestSelection,
      completeTask,
      submitWork,
      completeSimulatedTask,
      unlockBadge,
      calculateTotalXP,
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