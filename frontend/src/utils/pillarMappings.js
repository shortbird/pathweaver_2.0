// Diploma Pillars mapping utility - 5 Pillars of Optio
// Updated January 2025: Simplified to single-word pillar names

export const DIPLOMA_PILLARS = {
  // New single-word pillars with design system colors
  art: {
    name: 'Art',
    description: 'Original creation, artistic expression, innovation',
    color: 'var(--color-pillar-art)',
    gradient: 'from-[#F3EFF4] to-[#E7D5F2]',
    bgClass: 'bg-pillar-art',
    textClass: 'text-pillar-art',
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    icon: '',
    competencies: ['Visual Arts', 'Music', 'Drama & Theater', 'Creative Writing', 'Digital Media', 'Design']
  },
  stem: {
    name: 'STEM',
    description: 'Analysis, problem-solving, technical skills, research',
    color: 'var(--color-pillar-stem)',
    gradient: 'from-[#F3EFF4] to-[#DDF1FC]',
    bgClass: 'bg-pillar-stem',
    textClass: 'text-pillar-stem',
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    icon: '',
    competencies: ['Mathematics', 'Biology', 'Chemistry', 'Physics', 'Computer Science', 'Engineering', 'Data Science']
  },
  communication: {
    name: 'Communication',
    description: 'Expression, connection, teaching, sharing ideas',
    color: 'var(--color-pillar-communication)',
    gradient: 'from-[#F3EFF4] to-[#D1EED3]',
    bgClass: 'bg-pillar-communication',
    textClass: 'text-pillar-communication',
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200',
    icon: '',
    competencies: ['English', 'Foreign Languages', 'Journalism', 'Public Speaking', 'Digital Communication', 'Literature']
  },
  civics: {
    name: 'Civics',
    description: 'Understanding context, community impact, global awareness',
    color: 'var(--color-pillar-civics)',
    gradient: 'from-[#F3EFF4] to-[#F5F2E7]',
    bgClass: 'bg-pillar-civics',
    textClass: 'text-pillar-civics',
    bg: 'bg-orange-50',
    text: 'text-orange-700',
    border: 'border-orange-200',
    icon: '',
    competencies: ['History', 'Geography', 'Social Studies', 'World Cultures', 'Civics & Government', 'Psychology', 'Sociology']
  },
  wellness: {
    name: 'Wellness',
    description: 'Physical activity, practical skills, personal development',
    color: 'var(--color-pillar-wellness)',
    gradient: 'from-[#F3EFF4] to-[#FCD8D8]',
    bgClass: 'bg-pillar-wellness',
    textClass: 'text-pillar-wellness',
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    icon: '',
    competencies: ['Physical Education', 'Health & Nutrition', 'Personal Finance', 'Life Skills', 'Mental Wellness', 'Outdoor Education', 'Sports & Athletics']
  }
};

// Legacy mappings for backward compatibility
const LEGACY_PILLAR_MAP = {
  'arts_creativity': 'art',
  'creativity': 'art',
  'stem_logic': 'stem',
  'critical_thinking': 'stem',
  'language_communication': 'communication',
  'society_culture': 'civics',
  'cultural_literacy': 'civics',
  'life_wellness': 'wellness',
  'practical_skills': 'wellness',
  'Arts & Creativity': 'art',
  'STEM & Logic': 'stem',
  'Language & Communication': 'communication',
  'Society & Culture': 'civics',
  'Life & Wellness': 'wellness'
};

// Helper function to normalize pillar key
export const normalizePillarKey = (pillarKey) => {
  if (!pillarKey) return 'art'; // default

  // Check if it's already a valid key
  if (DIPLOMA_PILLARS[pillarKey]) {
    return pillarKey;
  }

  // Try legacy mapping
  const normalized = LEGACY_PILLAR_MAP[pillarKey];
  if (normalized) {
    return normalized;
  }

  // Try case-insensitive match
  const lowerKey = pillarKey.toLowerCase();
  if (DIPLOMA_PILLARS[lowerKey]) {
    return lowerKey;
  }

  // Default to art
  return 'art';
};

// Helper function to get pillar data (handles both old and new keys)
export const getPillarData = (pillarKey) => {
  const normalizedKey = normalizePillarKey(pillarKey);
  return DIPLOMA_PILLARS[normalizedKey] || DIPLOMA_PILLARS['art'];
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
    art: DIPLOMA_PILLARS.art,
    stem: DIPLOMA_PILLARS.stem,
    communication: DIPLOMA_PILLARS.communication,
    civics: DIPLOMA_PILLARS.civics,
    wellness: DIPLOMA_PILLARS.wellness
  };
};

// Export pillar keys for iteration
export const PILLAR_KEYS = [
  'art',
  'stem',
  'communication',
  'civics',
  'wellness'
];
