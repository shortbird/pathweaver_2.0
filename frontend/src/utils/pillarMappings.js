// Diploma Pillars mapping utility - 5 Pillars of Optio Diploma
// Updated to support new subject-aligned pillar structure

// Map old pillar keys to new ones
const PILLAR_KEY_MAP = {
  // Old keys -> new keys
  'creativity': 'arts_creativity',
  'critical_thinking': 'stem_logic',
  'practical_skills': 'life_wellness',
  'communication': 'language_communication',
  'cultural_literacy': 'society_culture',
  // New keys map to themselves
  'arts_creativity': 'arts_creativity',
  'stem_logic': 'stem_logic',
  'life_wellness': 'life_wellness',
  'language_communication': 'language_communication',
  'society_culture': 'society_culture'
};

export const DIPLOMA_PILLARS = {
  // New subject-aligned pillars
  arts_creativity: {
    name: 'Arts & Creativity',
    description: 'Original creation, artistic expression, innovation',
    color: 'purple',
    gradient: 'from-purple-500 to-pink-500',
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    icon: '🎨',
    competencies: ['Visual Arts', 'Music', 'Drama & Theater', 'Creative Writing', 'Digital Media', 'Design']
  },
  stem_logic: {
    name: 'STEM & Logic',
    description: 'Analysis, problem-solving, technical skills, research',
    color: 'blue',
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    icon: '🧠',
    competencies: ['Mathematics', 'Biology', 'Chemistry', 'Physics', 'Computer Science', 'Engineering', 'Data Science']
  },
  language_communication: {
    name: 'Language & Communication',
    description: 'Expression, connection, teaching, sharing ideas',
    color: 'green',
    gradient: 'from-green-500 to-emerald-500',
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: '💬',
    competencies: ['English', 'Foreign Languages', 'Journalism', 'Public Speaking', 'Digital Communication', 'Literature']
  },
  society_culture: {
    name: 'Society & Culture',
    description: 'Understanding context, community impact, global awareness',
    color: 'orange',
    gradient: 'from-orange-500 to-yellow-500',
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    icon: '🌍',
    competencies: ['History', 'Geography', 'Social Studies', 'World Cultures', 'Civics & Government', 'Psychology', 'Sociology']
  },
  life_wellness: {
    name: 'Life & Wellness',
    description: 'Physical activity, practical skills, personal development',
    color: 'red',
    gradient: 'from-red-500 to-rose-500',
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: '🛠️',
    competencies: ['Physical Education', 'Health & Nutrition', 'Personal Finance', 'Life Skills', 'Mental Wellness', 'Outdoor Education', 'Sports & Athletics']
  },
  // Keep old pillar definitions for backwards compatibility
  creativity: {
    name: 'Arts & Creativity',
    description: 'Original creation, artistic expression, innovation',
    color: 'purple',
    gradient: 'from-purple-500 to-pink-500',
    bg: 'bg-purple-100',
    text: 'text-purple-700',
    icon: '🎨',
    competencies: ['Visual Arts', 'Music', 'Drama & Theater', 'Creative Writing', 'Digital Media', 'Design']
  },
  critical_thinking: {
    name: 'STEM & Logic',
    description: 'Analysis, problem-solving, technical skills, research',
    color: 'blue',
    gradient: 'from-blue-500 to-cyan-500',
    bg: 'bg-blue-100',
    text: 'text-blue-700',
    icon: '🧠',
    competencies: ['Mathematics', 'Biology', 'Chemistry', 'Physics', 'Computer Science', 'Engineering', 'Data Science']
  },
  practical_skills: {
    name: 'Life & Wellness',
    description: 'Physical activity, practical skills, personal development',
    color: 'green',
    gradient: 'from-green-500 to-emerald-500',
    bg: 'bg-green-100',
    text: 'text-green-700',
    icon: '🛠️',
    competencies: ['Physical Education', 'Health & Nutrition', 'Personal Finance', 'Life Skills', 'Mental Wellness', 'Outdoor Education', 'Sports & Athletics']
  },
  communication: {
    name: 'Language & Communication',
    description: 'Expression, connection, teaching, sharing ideas',
    color: 'orange',
    gradient: 'from-orange-500 to-yellow-500',
    bg: 'bg-orange-100',
    text: 'text-orange-700',
    icon: '💬',
    competencies: ['English', 'Foreign Languages', 'Journalism', 'Public Speaking', 'Digital Communication', 'Literature']
  },
  cultural_literacy: {
    name: 'Society & Culture',
    description: 'Understanding context, community impact, global awareness',
    color: 'red',
    gradient: 'from-red-500 to-rose-500',
    bg: 'bg-red-100',
    text: 'text-red-700',
    icon: '🌍',
    competencies: ['History', 'Geography', 'Social Studies', 'World Cultures', 'Civics & Government', 'Psychology', 'Sociology']
  }
};

// Helper function to normalize pillar key
export const normalizePillarKey = (pillarKey) => {
  if (!pillarKey) return 'arts_creativity'; // default
  // If it's an old key, map it to the new one
  return PILLAR_KEY_MAP[pillarKey] || pillarKey;
};

// Helper function to get pillar data (handles both old and new keys)
export const getPillarData = (pillarKey) => {
  const normalizedKey = normalizePillarKey(pillarKey);
  return DIPLOMA_PILLARS[normalizedKey] || DIPLOMA_PILLARS['arts_creativity'];
};

// Helper function to get pillar name
export const getPillarName = (pillarKey) => {
  const pillarData = getPillarData(pillarKey);
  return pillarData?.name || 'Unknown';
};

// Helper function to get pillar color classes
export const getPillarColor = (pillarKey) => {
  const pillarData = getPillarData(pillarKey);
  return `${pillarData?.bg || 'bg-gray-100'} ${pillarData?.text || 'text-gray-800'}`;
};

// Helper function to get pillar gradient
export const getPillarGradient = (pillarKey) => {
  const pillarData = getPillarData(pillarKey);
  return pillarData?.gradient || 'from-gray-500 to-gray-600';
};

// Helper function to get all pillars (new structure)
export const getAllPillars = () => {
  return {
    arts_creativity: DIPLOMA_PILLARS.arts_creativity,
    stem_logic: DIPLOMA_PILLARS.stem_logic,
    language_communication: DIPLOMA_PILLARS.language_communication,
    society_culture: DIPLOMA_PILLARS.society_culture,
    life_wellness: DIPLOMA_PILLARS.life_wellness
  };
};

// Export pillar keys for iteration
export const PILLAR_KEYS = [
  'arts_creativity',
  'stem_logic',
  'language_communication',
  'society_culture',
  'life_wellness'
];