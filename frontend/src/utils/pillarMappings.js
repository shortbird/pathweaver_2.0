// Diploma Pillars mapping utility - 5 Pillars of Optio Diploma
export const DIPLOMA_PILLARS = {
  creativity: {
    name: 'Creativity',
    description: 'The practice of generating new ideas and bringing them to life',
    color: 'purple',
    icon: '🎨',
    competencies: ['Artistic Expression', 'Design Thinking', 'Innovation', 'Problem-Solving']
  },
  critical_thinking: {
    name: 'Critical Thinking',
    description: 'The practice of analyzing information, thinking logically, and making reasoned judgments',
    color: 'blue',
    icon: '🧠',
    competencies: ['Analysis & Research', 'Logic & Reasoning', 'Systems Thinking', 'Evidence-Based Decision Making']
  },
  practical_skills: {
    name: 'Practical Skills',
    description: 'The practice of hands-on, real-world abilities for life and work',
    color: 'green',
    icon: '🛠️',
    competencies: ['Life Skills', 'Technical Skills', 'Financial Literacy', 'Health & Wellness']
  },
  communication: {
    name: 'Communication',
    description: 'The practice of sharing and receiving information effectively',
    color: 'orange',
    icon: '💬',
    competencies: ['Writing & Storytelling', 'Public Speaking', 'Digital Communication', 'Active Listening']
  },
  cultural_literacy: {
    name: 'Cultural Literacy',
    description: 'The practice of understanding the context of the world—its history, cultures, and social fabric',
    color: 'red',
    icon: '🌍',
    competencies: ['Global Awareness', 'History & Context', 'Empathy & Perspective-Taking', 'Community Engagement']
  }
}

// Helper function to get pillar name
export const getPillarName = (pillarKey) => {
  return DIPLOMA_PILLARS[pillarKey]?.name || pillarKey
}

// Helper function to get pillar color
export const getPillarColor = (pillarKey) => {
  const colors = {
    creativity: 'bg-purple-100 text-purple-800',
    critical_thinking: 'bg-blue-100 text-blue-800',
    practical_skills: 'bg-green-100 text-green-800',
    communication: 'bg-orange-100 text-orange-800',
    cultural_literacy: 'bg-red-100 text-red-800'
  }
  return colors[pillarKey] || 'bg-gray-100 text-gray-800'
}