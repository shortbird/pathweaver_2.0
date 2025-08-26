// Diploma Pillars mapping utility
export const DIPLOMA_PILLARS = {
  creativity: {
    name: 'Creativity',
    color: 'purple',
    icon: '🎨',
    competencies: ['Artistic Expression', 'Design Thinking', 'Innovation', 'Problem-Solving']
  },
  critical_thinking: {
    name: 'Critical Thinking',
    color: 'blue',
    icon: '🧠',
    competencies: ['Analysis & Research', 'Logic & Reasoning', 'Systems Thinking', 'Evidence-Based Decision Making']
  },
  practical_skills: {
    name: 'Practical Skills',
    color: 'green',
    icon: '🛠️',
    competencies: ['Life Skills', 'Technical Skills', 'Financial Literacy', 'Health & Wellness']
  },
  communication: {
    name: 'Communication',
    color: 'orange',
    icon: '💬',
    competencies: ['Writing & Storytelling', 'Public Speaking', 'Digital Communication', 'Active Listening']
  },
  cultural_literacy: {
    name: 'Cultural Literacy',
    color: 'red',
    icon: '🌍',
    competencies: ['Global Awareness', 'History & Context', 'Empathy & Perspective-Taking', 'Community Engagement']
  }
}

// Old skill categories (for backward compatibility if needed)
export const OLD_SKILL_CATEGORIES = {
  reading_writing: 'communication',
  thinking_skills: 'critical_thinking',
  personal_growth: 'practical_skills',
  life_skills: 'practical_skills',
  making_creating: 'creativity',
  world_understanding: 'cultural_literacy'
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

// Helper to convert old category to new pillar
export const mapOldCategoryToPillar = (oldCategory) => {
  return OLD_SKILL_CATEGORIES[oldCategory] || oldCategory
}