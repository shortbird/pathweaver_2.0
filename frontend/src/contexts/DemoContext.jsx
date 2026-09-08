import React, { createContext, useContext, useState, useCallback } from 'react';

const DemoContext = createContext();

export const useDemo = () => {
  const context = useContext(DemoContext);
  if (!context) {
    throw new Error('useDemo must be used within a DemoProvider');
  }
  return context;
};

// New diverse quests for the reimagined demo (6 options)
const DEMO_QUESTS = [
  {
    id: 'build-robot',
    title: 'Build a Robot',
    description: 'Design, build, and program your own functional robot',
    icon: 'CpuChipIcon',
    color: 'blue',
    subjects: ['science', 'math', 'cte', 'digital_literacy'],
    previewTasks: ['Design circuit', 'Program movement', 'Document build'],
    totalXP: 450
  },
  {
    id: 'compose-music',
    title: 'Compose Original Music',
    description: 'Write and perform your own original piece of music',
    icon: 'MusicalNoteIcon',
    color: 'pink',
    subjects: ['fine_arts', 'language_arts'],
    previewTasks: ['Learn theory', 'Write melody', 'Record performance'],
    totalXP: 350
  },
  {
    id: 'start-business',
    title: 'Start a Small Business',
    description: 'Launch your own entrepreneurial venture and make your first sale',
    icon: 'BriefcaseIcon',
    color: 'purple',
    subjects: ['financial_literacy', 'math', 'language_arts'],
    previewTasks: ['Market research', 'Business plan', 'First customer'],
    totalXP: 400
  },
  {
    id: 'train-5k',
    title: 'Train for a 5K Race',
    description: 'Build endurance and complete your first 5K run',
    icon: 'BoltIcon',
    color: 'teal',
    subjects: ['pe', 'health', 'math'],
    previewTasks: ['Training schedule', 'Track progress', 'Race day'],
    totalXP: 350
  },
  {
    id: 'create-film',
    title: 'Create a Short Film',
    description: 'Write, shoot, and edit your own short film',
    icon: 'FilmIcon',
    color: 'orange',
    subjects: ['fine_arts', 'language_arts', 'digital_literacy'],
    previewTasks: ['Write screenplay', 'Film scenes', 'Edit video'],
    totalXP: 450
  },
  {
    id: 'design-garden',
    title: 'Design a Community Garden',
    description: 'Plan and create a garden space for your community',
    icon: 'SparklesIcon',
    color: 'green',
    subjects: ['science', 'social_studies', 'health'],
    previewTasks: ['Research plants', 'Design layout', 'Plant & grow'],
    totalXP: 400
  }
];

// Interest chips for personalization step
const INTEREST_CHIPS = [
  { id: 'gaming', label: 'Gaming', icon: 'GamepadIcon' },
  { id: 'music', label: 'Music', icon: 'MusicalNoteIcon' },
  { id: 'sports', label: 'Sports', icon: 'TrophyIcon' },
  { id: 'technology', label: 'Technology', icon: 'CpuChipIcon' },
  { id: 'art', label: 'Art', icon: 'PaintBrushIcon' },
  { id: 'outdoors', label: 'Outdoors', icon: 'SunIcon' }
];

// Demo credit tracking - maps to academic subjects
const initialCredits = {
  science: 0,
  math: 0,
  language_arts: 0,
  fine_arts: 0,
  digital_literacy: 0,
  pe: 0,
  health: 0,
  social_studies: 0,
  financial_literacy: 0,
  cte: 0,
  electives: 0
};

// Subject display names
const SUBJECT_NAMES = {
  science: 'Science',
  math: 'Mathematics',
  language_arts: 'Language Arts',
  fine_arts: 'Fine Arts',
  digital_literacy: 'Digital Literacy',
  pe: 'Physical Education',
  health: 'Health',
  social_studies: 'Social Studies',
  financial_literacy: 'Financial Literacy',
  cte: 'Career & Technical',
  electives: 'Electives'
};

// Subject colors for UI
const SUBJECT_COLORS = {
  science: 'blue',
  math: 'indigo',
  language_arts: 'amber',
  fine_arts: 'pink',
  digital_literacy: 'cyan',
  pe: 'green',
  health: 'teal',
  social_studies: 'orange',
  financial_literacy: 'purple',
  cte: 'slate',
  electives: 'gray'
};

const initialState = {
  // 4-step flow: 0=Hero, 1=QuestSelection, 2=Personalization, 3=Evidence, 4=Portfolio
  currentStep: 0,

  // Quest selection (single select now)
  selectedQuest: null,

  // Personalization state
  selectedInterests: [],
  customInterestInput: '',
  generatedTasks: [],
  isGeneratingTasks: false,
  generationError: null,
  rateLimitRemaining: 3,

  // Evidence submission state
  submittedEvidence: null, // { type: 'photo' | 'link' | 'reflection', task: {...} }
  evidenceAnimationComplete: false,

  // Credit tracking
  demoCredits: { ...initialCredits },
  totalXPEarned: 0,

  // Demo metadata
  demoStartTime: null,
  interactions: []
};

export const DemoProvider = ({ children }) => {
  const [demoState, setDemoState] = useState(initialState);

  // Step navigation
  const nextStep = useCallback(() => {
    setDemoState(prev => ({
      ...prev,
      currentStep: Math.min(prev.currentStep + 1, 4)
    }));
  }, []);

  const previousStep = useCallback(() => {
    setDemoState(prev => ({
      ...prev,
      currentStep: Math.max(prev.currentStep - 1, 0)
    }));
  }, []);

  const goToStep = useCallback((step) => {
    setDemoState(prev => ({
      ...prev,
      currentStep: Math.max(0, Math.min(step, 4))
    }));
  }, []);

  // Quest selection (single select)
  const selectQuest = useCallback((questId) => {
    const quest = DEMO_QUESTS.find(q => q.id === questId);
    setDemoState(prev => ({
      ...prev,
      selectedQuest: quest,
      // Reset personalization when changing quest
      selectedInterests: [],
      customInterestInput: '',
      generatedTasks: [],
      generationError: null
    }));
  }, []);

  // Interest selection
  const toggleInterest = useCallback((interestId) => {
    setDemoState(prev => {
      const isSelected = prev.selectedInterests.includes(interestId);
      if (isSelected) {
        return {
          ...prev,
          selectedInterests: prev.selectedInterests.filter(id => id !== interestId)
        };
      } else if (prev.selectedInterests.length < 3) {
        return {
          ...prev,
          selectedInterests: [...prev.selectedInterests, interestId]
        };
      }
      return prev;
    });
  }, []);

  const setCustomInterestInput = useCallback((text) => {
    setDemoState(prev => ({
      ...prev,
      customInterestInput: text.slice(0, 100) // Max 100 chars
    }));
  }, []);

  // AI Task generation
  const setGeneratedTasks = useCallback((tasks) => {
    setDemoState(prev => ({
      ...prev,
      generatedTasks: tasks,
      isGeneratingTasks: false,
      generationError: null
    }));
  }, []);

  const setGeneratingTasks = useCallback((isGenerating) => {
    setDemoState(prev => ({
      ...prev,
      isGeneratingTasks: isGenerating,
      generationError: isGenerating ? null : prev.generationError
    }));
  }, []);

  const setGenerationError = useCallback((error) => {
    setDemoState(prev => ({
      ...prev,
      generationError: error,
      isGeneratingTasks: false
    }));
  }, []);

  const setRateLimitRemaining = useCallback((remaining) => {
    setDemoState(prev => ({
      ...prev,
      rateLimitRemaining: remaining
    }));
  }, []);

  // Evidence submission
  const submitEvidence = useCallback((evidenceType, task) => {
    // Calculate XP from the task
    const xp = task?.xp || 150;
    const subjects = task?.subjects || ['electives'];

    // Distribute XP across subjects
    const xpPerSubject = Math.round(xp / subjects.length);

    setDemoState(prev => {
      const newCredits = { ...prev.demoCredits };
      subjects.forEach(subject => {
        if (subject in newCredits) {
          newCredits[subject] += xpPerSubject;
        }
      });

      return {
        ...prev,
        submittedEvidence: { type: evidenceType, task },
        totalXPEarned: prev.totalXPEarned + xp,
        demoCredits: newCredits,
        evidenceAnimationComplete: false
      };
    });
  }, []);

  const completeEvidenceAnimation = useCallback(() => {
    setDemoState(prev => ({
      ...prev,
      evidenceAnimationComplete: true
    }));
  }, []);

  // Calculate total credits earned (XP to credits conversion: 2000 XP = 1 credit)
  const calculateCreditsEarned = useCallback(() => {
    const totalXP = Object.values(demoState.demoCredits).reduce((sum, xp) => sum + xp, 0);
    return (totalXP / 2000).toFixed(2);
  }, [demoState.demoCredits]);

  // Get top subjects by XP
  const getTopSubjects = useCallback(() => {
    const subjects = Object.entries(demoState.demoCredits)
      .filter(([_, xp]) => xp > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return subjects.map(([subject, xp]) => ({
      subject,
      name: SUBJECT_NAMES[subject],
      xp,
      color: SUBJECT_COLORS[subject],
      credits: (xp / 2000).toFixed(2)
    }));
  }, [demoState.demoCredits]);

  // Reset demo
  const resetDemo = useCallback(() => {
    setDemoState({ ...initialState, demoStartTime: Date.now() });
  }, []);

  // Track interaction for analytics
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

  // Start demo (called from hero)
  const startDemo = useCallback(() => {
    setDemoState(prev => ({
      ...prev,
      currentStep: 1,
      demoStartTime: Date.now()
    }));
    trackInteraction('demo_started');
  }, [trackInteraction]);

  const value = {
    demoState,
    demoQuests: DEMO_QUESTS,
    interestChips: INTEREST_CHIPS,
    subjectNames: SUBJECT_NAMES,
    subjectColors: SUBJECT_COLORS,
    actions: {
      nextStep,
      previousStep,
      goToStep,
      selectQuest,
      toggleInterest,
      setCustomInterestInput,
      setGeneratedTasks,
      setGeneratingTasks,
      setGenerationError,
      setRateLimitRemaining,
      submitEvidence,
      completeEvidenceAnimation,
      calculateCreditsEarned,
      getTopSubjects,
      resetDemo,
      trackInteraction,
      startDemo
    }
  };

  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
};
