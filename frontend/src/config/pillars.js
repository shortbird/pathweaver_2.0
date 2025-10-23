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
    color: '#2469D1',
    gradient: 'from-[#2469D1] to-[#1B4FA3]',
    icon: 'BeakerIcon',
    subcategories: ['Science', 'Technology', 'Engineering', 'Mathematics'],
  },
  wellness: {
    display_name: 'Wellness',
    description: 'Physical and mental health, mindfulness, and self-care',
    color: '#FF9028',
    gradient: 'from-[#FF9028] to-[#E67A1A]',
    icon: 'HeartIcon',
    subcategories: ['Physical Health', 'Mental Health', 'Mindfulness', 'Nutrition'],
  },
  communication: {
    display_name: 'Communication',
    description: 'Writing, speaking, listening, and interpersonal skills',
    color: '#3DA24A',
    gradient: 'from-[#3DA24A] to-[#2E8A3A]',
    icon: 'ChatBubbleLeftRightIcon',
    subcategories: ['Writing', 'Speaking', 'Listening', 'Collaboration'],
  },
  civics: {
    display_name: 'Civics',
    description: 'Community engagement, leadership, and civic responsibility',
    color: '#E65C5C',
    gradient: 'from-[#E65C5C] to-[#D43F3F]',
    icon: 'UserGroupIcon',
    subcategories: ['Community', 'Leadership', 'Civic Action', 'Democracy'],
  },
  art: {
    display_name: 'Art',
    description: 'Creative expression through visual arts, music, and performance',
    color: '#AF56E5',
    gradient: 'from-[#AF56E5] to-[#9945D1]',
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
