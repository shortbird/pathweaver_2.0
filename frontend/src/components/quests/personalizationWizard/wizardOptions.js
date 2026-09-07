// The wizard's fixed vocabularies: what a student can say they are interested
// in, how hard they want the quest to be, the diploma subjects a task can count
// toward, and the cap on the per-task complexity dial. Lifted out of
// QuestPersonalizationWizard.jsx by QF-02 -- pure data, read by more than one
// step.
export const INTEREST_OPTIONS = [
  { id: 'sports', label: 'Sports & Athletics', icon: '⚽' },
  { id: 'music', label: 'Music & Performance', icon: '🎵' },
  { id: 'art', label: 'Visual Arts', icon: '🎨' },
  { id: 'gaming', label: 'Gaming & Esports', icon: '🎮' },
  { id: 'business', label: 'Business & Entrepreneurship', icon: '💼' },
  { id: 'technology', label: 'Technology & Coding', icon: '💻' },
  { id: 'nature', label: 'Nature & Environment', icon: '🌿' },
  { id: 'cooking', label: 'Cooking & Food', icon: '🍳' },
  { id: 'writing', label: 'Creative Writing', icon: '✍️' },
  { id: 'social', label: 'Social Impact', icon: '🤝' }
];

// Challenge levels for AI task generation. Values match the backend's
// VALID_CHALLENGE_LEVELS; the student's last choice is remembered server-side
// (users.preferred_challenge_level).
export const CHALLENGE_LEVELS = [
  { id: 'easier', label: 'Easier', description: 'Smaller steps, quicker wins' },
  { id: 'standard', label: 'Standard', description: 'A good stretch for most students' },
  { id: 'challenge', label: 'Challenge', description: 'Bigger projects, more depth, more XP' }
];

// Max taps in one direction on the per-task complexity dial.
export const MAX_ADJUST_STEPS = 2;

// Diploma subjects for credit tracking (11 subjects)
export const DIPLOMA_SUBJECTS = [
  { id: 'language_arts', label: 'Language Arts', icon: '📖' },
  { id: 'math', label: 'Math', icon: '🔢' },
  { id: 'science', label: 'Science', icon: '🔬' },
  { id: 'social_studies', label: 'Social Studies', icon: '🌍' },
  { id: 'financial_literacy', label: 'Financial Literacy', icon: '💰' },
  { id: 'health', label: 'Health', icon: '❤️' },
  { id: 'pe', label: 'PE', icon: '🏃' },
  { id: 'fine_arts', label: 'Fine Arts', icon: '🎨' },
  { id: 'cte', label: 'CTE', icon: '🔧' },
  { id: 'digital_literacy', label: 'Digital Literacy', icon: '💻' },
  { id: 'electives', label: 'Electives', icon: '✨' }
];
