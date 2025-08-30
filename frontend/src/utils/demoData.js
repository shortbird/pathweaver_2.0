export const DEMO_DATA = {
  user: {
    id: 'demo-user-001',
    name: 'Alex Chen',
    avatar: '/images/demo/avatar-alex.jpg',
    joinDate: 'September 2024',
    grade: '10th Grade',
    location: 'San Francisco, CA',
    bio: 'Passionate about robotics, music, and creative writing. Building my portfolio one quest at a time!'
  },
  
  stats: {
    totalXP: 1450,
    questsCompleted: 12,
    tasksCompleted: 48,
    hoursLearning: 67,
    currentStreak: 15,
    rank: 'Explorer',
    percentile: 85
  },
  
  sampleQuests: [
    {
      id: 'sq-1',
      title: 'Train for a 5K Race',
      pillar: 'practical_skills',
      description: 'Build endurance and complete your first 5K race. Track your progress, learn proper running form, and develop a sustainable training routine.',
      xpReward: 200,
      tasks: 4,
      estimatedHours: 20,
      teamUpEligible: true,
      difficulty: 'intermediate',
      tags: ['fitness', 'health', 'goals'],
      thumbnail: '/images/demo/quest-5k.jpg',
      completionRate: 78,
      source: 'custom'
    },
    {
      id: 'sq-2',
      title: 'Code Your First Web App',
      pillar: 'critical_thinking',
      description: 'Learn HTML, CSS, and JavaScript to build an interactive web application. Deploy it online and share with friends!',
      xpReward: 250,
      tasks: 6,
      estimatedHours: 30,
      teamUpEligible: true,
      difficulty: 'intermediate',
      tags: ['coding', 'web', 'technology'],
      thumbnail: '/images/demo/quest-webapp.jpg',
      completionRate: 65,
      source: 'code_academy'
    },
    {
      id: 'sq-3',
      title: 'Master Watercolor Painting',
      pillar: 'creativity',
      description: 'Learn watercolor techniques from basic washes to advanced wet-on-wet methods. Create a portfolio of original artwork.',
      xpReward: 180,
      tasks: 5,
      estimatedHours: 15,
      teamUpEligible: false,
      difficulty: 'beginner',
      tags: ['art', 'painting', 'creative'],
      thumbnail: '/images/demo/quest-watercolor.jpg',
      completionRate: 82,
      source: 'custom'
    },
    {
      id: 'sq-4',
      title: 'Debate Current Events',
      pillar: 'communication',
      description: 'Research, prepare, and participate in structured debates on contemporary issues. Develop critical thinking and public speaking skills.',
      xpReward: 220,
      tasks: 4,
      estimatedHours: 12,
      teamUpEligible: true,
      difficulty: 'advanced',
      tags: ['debate', 'speaking', 'research'],
      thumbnail: '/images/demo/quest-debate.jpg',
      completionRate: 58,
      source: 'custom'
    },
    {
      id: 'sq-5',
      title: 'Explore Ancient Civilizations',
      pillar: 'cultural_literacy',
      description: 'Journey through history to understand the rise and fall of ancient civilizations. Create multimedia presentations of your findings.',
      xpReward: 160,
      tasks: 3,
      estimatedHours: 10,
      teamUpEligible: false,
      difficulty: 'beginner',
      tags: ['history', 'culture', 'research'],
      thumbnail: '/images/demo/quest-ancient.jpg',
      completionRate: 91,
      source: 'khan_academy'
    },
    {
      id: 'sq-6',
      title: 'Build a Robot Companion',
      pillar: 'practical_skills',
      description: 'Design and build a functional robot using Arduino or Raspberry Pi. Program it to perform tasks and respond to commands.',
      xpReward: 300,
      tasks: 7,
      estimatedHours: 40,
      teamUpEligible: true,
      difficulty: 'advanced',
      tags: ['robotics', 'engineering', 'programming'],
      thumbnail: '/images/demo/quest-robot.jpg',
      completionRate: 43,
      source: 'brilliant'
    }
  ],
  
  testimonials: [
    {
      id: 't1',
      name: 'Sarah Martinez',
      role: 'Student, Age 15',
      avatar: '/images/demo/avatar-sarah.jpg',
      quote: 'Optio helped me discover my passion for robotics! I never thought I could build my own robot, but the quest system made it achievable step by step.',
      questCompleted: 'Build a Line-Following Robot',
      xpEarned: 280,
      pillar: 'practical_skills'
    },
    {
      id: 't2',
      name: 'James Thompson',
      role: 'Student, Age 14',
      avatar: '/images/demo/avatar-james.jpg',
      quote: 'The best part is showing my portfolio to colleges. They can see actual evidence of what I\'ve learned, not just grades.',
      questCompleted: 'Create a Documentary Film',
      xpEarned: 240,
      pillar: 'creativity'
    },
    {
      id: 't3',
      name: 'Maya Patel',
      role: 'Student, Age 16',
      avatar: '/images/demo/avatar-maya.jpg',
      quote: 'I love the team-up feature! Working with friends on quests makes learning so much more fun and we hold each other accountable.',
      questCompleted: 'Organize a Community Service Project',
      xpEarned: 320,
      pillar: 'communication'
    }
  ],
  
  howItWorksSteps: [
    {
      id: 'step-1',
      number: '1',
      title: 'Choose Your Quest',
      description: 'Browse hundreds of quests across five skill pillars. Filter by interest, difficulty, or time commitment.',
      icon: '🎯',
      animation: 'quest-cards-shuffle'
    },
    {
      id: 'step-2',
      number: '2',
      title: 'Complete Tasks',
      description: 'Each quest breaks down into manageable tasks. Upload evidence of your work - text, photos, videos, or links.',
      icon: '📝',
      animation: 'task-checkoff'
    },
    {
      id: 'step-3',
      number: '3',
      title: 'Earn XP',
      description: 'Gain experience points for each completed quest. Watch your skills grow across different pillars.',
      icon: '⭐',
      animation: 'xp-counter'
    },
    {
      id: 'step-4',
      number: '4',
      title: 'Share Your Journey',
      description: 'Your diploma showcases all your achievements with real evidence. Perfect for college applications and resumes.',
      icon: '🎓',
      animation: 'diploma-share'
    }
  ],
  
  pillarDescriptions: {
    creativity: {
      name: 'Creativity',
      icon: '🎨',
      color: 'purple',
      description: 'Express yourself through art, music, writing, and innovation'
    },
    critical_thinking: {
      name: 'Critical Thinking',
      icon: '🧠',
      color: 'blue',
      description: 'Solve problems, analyze data, and think logically'
    },
    practical_skills: {
      name: 'Practical Skills',
      icon: '🔧',
      color: 'green',
      description: 'Build, create, and develop hands-on abilities'
    },
    communication: {
      name: 'Communication',
      icon: '💬',
      color: 'orange',
      description: 'Express ideas clearly and connect with others'
    },
    cultural_literacy: {
      name: 'Cultural Literacy',
      icon: '🌍',
      color: 'red',
      description: 'Understand diverse perspectives and global contexts'
    }
  },
  
  faqItems: [
    {
      question: 'How is this different from regular online courses?',
      answer: 'Optio focuses on project-based learning where you create real evidence of your skills. Instead of just watching videos, you DO things and build a portfolio.'
    },
    {
      question: 'Can I use external resources like Khan Academy?',
      answer: 'Yes! Many quests integrate with platforms like Khan Academy, Brilliant, and Code Academy. You can earn XP for completing their courses.'
    },
    {
      question: 'Is my data safe?',
      answer: 'Absolutely. We use enterprise-grade security and never share your personal information. You control what appears on your public diploma.'
    },
    {
      question: 'What if I need help with a quest?',
      answer: 'Use the team-up feature to collaborate with friends, ask questions in the community forum, or get guidance from advisors.'
    }
  ],
  
  mockNotifications: [
    {
      id: 'n1',
      type: 'achievement',
      message: 'You earned the "Week Warrior" badge!',
      timestamp: '2 hours ago'
    },
    {
      id: 'n2',
      type: 'team_invite',
      message: 'Jordan invited you to team up on "Build a Weather Station"',
      timestamp: '5 hours ago'
    },
    {
      id: 'n3',
      type: 'milestone',
      message: 'You reached 1000 XP! You are now a "Skilled Explorer"',
      timestamp: '1 day ago'
    }
  ]
};

// Helper function to get random items from arrays
export const getRandomItems = (array, count) => {
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
};

// Helper function to calculate total XP from pillars
export const calculateTotalXP = (pillars) => {
  return Object.values(pillars).reduce((sum, xp) => sum + xp, 0);
};

// Helper function to get pillar with highest XP
export const getTopPillar = (pillars) => {
  return Object.entries(pillars).reduce((max, [pillar, xp]) => 
    xp > max.xp ? { pillar, xp } : max, 
    { pillar: null, xp: 0 }
  );
};

// Helper function to format XP display
export const formatXP = (xp) => {
  if (xp >= 1000) {
    return `${(xp / 1000).toFixed(1)}k`;
  }
  return xp.toString();
};

// Helper function to get achievement level based on XP
export const getAchievementLevel = (xp) => {
  if (xp < 500) return { level: 'Beginner', color: 'gray' };
  if (xp < 1000) return { level: 'Explorer', color: 'green' };
  if (xp < 2000) return { level: 'Adventurer', color: 'blue' };
  if (xp < 5000) return { level: 'Master', color: 'purple' };
  return { level: 'Legend', color: 'gold' };
};

export default DEMO_DATA;