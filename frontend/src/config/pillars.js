/**
 * Pillar Configuration - Frontend Constants
 *
 * This file provides synchronous access to pillar data for components
 * that cannot use async/await (e.g., inline styles, class names).
 *
 * For most use cases, prefer using pillarService.js which fetches
 * from the API with caching.
 */

export const PILLARS = {
  stem: {
    display_name: 'STEM',
    description: 'Science, Technology, Engineering, and Mathematics',
    color: 'var(--color-pillar-stem)',
    gradient: 'from-pillar-stem to-pillar-stem-dark',  // Tailwind gradient utilities
    icon: 'BeakerIcon',
    subcategories: ['Science', 'Technology', 'Engineering', 'Mathematics'],
  },
  wellness: {
    display_name: 'Wellness',
    description: 'Physical and mental health, mindfulness, and self-care',
    color: 'var(--color-pillar-wellness)',
    gradient: 'from-pillar-wellness to-pillar-wellness-dark',  // Tailwind gradient utilities
    icon: 'HeartIcon',
    subcategories: ['Physical Health', 'Mental Health', 'Mindfulness', 'Nutrition'],
  },
  communication: {
    display_name: 'Communication',
    description: 'Writing, speaking, listening, and interpersonal skills',
    color: 'var(--color-pillar-communication)',
    gradient: 'from-pillar-communication to-pillar-communication-dark',  // Tailwind gradient utilities
    icon: 'ChatBubbleLeftRightIcon',
    subcategories: ['Writing', 'Speaking', 'Listening', 'Collaboration'],
  },
  civics: {
    display_name: 'Civics',
    description: 'Community engagement, leadership, and civic responsibility',
    color: 'var(--color-pillar-civics)',
    gradient: 'from-pillar-civics to-pillar-civics-dark',  // Tailwind gradient utilities
    icon: 'UserGroupIcon',
    subcategories: ['Community', 'Leadership', 'Civic Action', 'Democracy'],
  },
  art: {
    display_name: 'Art',
    description: 'Creative expression through visual arts, music, and performance',
    color: 'var(--color-pillar-art)',
    gradient: 'from-pillar-art to-pillar-art-dark',  // Tailwind gradient utilities
    icon: 'PaintBrushIcon',
    subcategories: ['Visual Arts', 'Music', 'Performance', 'Design'],
  },
};

export const PILLAR_KEYS = Object.keys(PILLARS);

// Helper functions for synchronous access
export const getPillarColor = (pillarKey) => {
  return PILLARS[pillarKey?.toLowerCase()]?.color || PILLARS.art.color;
};

export const getPillarDisplayName = (pillarKey) => {
  return PILLARS[pillarKey?.toLowerCase()]?.display_name || PILLARS.art.display_name;
};

export const getPillarGradient = (pillarKey) => {
  return PILLARS[pillarKey?.toLowerCase()]?.gradient || PILLARS.art.gradient;
};

export const getPillarIcon = (pillarKey) => {
  return PILLARS[pillarKey?.toLowerCase()]?.icon || PILLARS.art.icon;
};

export const getPillarDescription = (pillarKey) => {
  return PILLARS[pillarKey?.toLowerCase()]?.description || PILLARS.art.description;
};

export const isValidPillar = (pillarKey) => {
  return pillarKey?.toLowerCase() in PILLARS;
};

export const getPillarData = (pillarKey) => {
  return PILLARS[pillarKey?.toLowerCase()] || PILLARS.art;
};

export default {
  PILLARS,
  PILLAR_KEYS,
  getPillarColor,
  getPillarDisplayName,
  getPillarGradient,
  getPillarIcon,
  getPillarDescription,
  isValidPillar,
  getPillarData,
};
