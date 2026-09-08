/**
 * Pillar Service - Centralized pillar data management
 *
 * Fetches pillar configuration from the backend API with local caching
 * and fallback to hardcoded data if API is unavailable.
 */

import api from './api';

// Fallback pillar data (used if API is unavailable)
const FALLBACK_PILLARS = {
  stem: {
    display_name: 'STEM',
    description: 'Science, Technology, Engineering, and Mathematics',
    color: 'var(--color-pillar-stem)',
    gradient: 'bg-gradient-pillar-stem',
    icon: 'BeakerIcon',
    subcategories: ['Science', 'Technology', 'Engineering', 'Mathematics'],
  },
  wellness: {
    display_name: 'Wellness',
    description: 'Physical and mental health, mindfulness, and self-care',
    color: 'var(--color-pillar-wellness)',
    gradient: 'bg-gradient-pillar-wellness',
    icon: 'HeartIcon',
    subcategories: ['Physical Health', 'Mental Health', 'Mindfulness', 'Nutrition'],
  },
  communication: {
    display_name: 'Communication',
    description: 'Writing, speaking, listening, and interpersonal skills',
    color: 'var(--color-pillar-communication)',
    gradient: 'bg-gradient-pillar-communication',
    icon: 'ChatBubbleLeftRightIcon',
    subcategories: ['Writing', 'Speaking', 'Listening', 'Collaboration'],
  },
  civics: {
    display_name: 'Civics',
    description: 'Community engagement, leadership, and civic responsibility',
    color: 'var(--color-pillar-civics)',
    gradient: 'bg-gradient-pillar-civics',
    icon: 'UserGroupIcon',
    subcategories: ['Community', 'Leadership', 'Civic Action', 'Democracy'],
  },
  art: {
    display_name: 'Art',
    description: 'Creative expression through visual arts, music, and performance',
    color: 'var(--color-pillar-art)',
    gradient: 'bg-gradient-pillar-art',
    icon: 'PaintBrushIcon',
    subcategories: ['Visual Arts', 'Music', 'Performance', 'Design'],
  },
};

// Cache for pillar data
let pillarCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

/**
 * Get all pillar definitions
 * @returns {Promise<Object>} Object containing pillars and keys
 */
export const getAllPillars = async () => {
  // Check cache first
  if (pillarCache && cacheTimestamp && (Date.now() - cacheTimestamp < CACHE_DURATION)) {
    return pillarCache;
  }

  try {
    const response = await api.get('/api/pillars');

    // Cache the response
    pillarCache = {
      pillars: response.data.pillars,
      keys: response.data.keys,
    };
    cacheTimestamp = Date.now();

    return pillarCache;
  } catch (error) {
    console.warn('Failed to fetch pillars from API, using fallback data:', error);

    // Return fallback data
    return {
      pillars: FALLBACK_PILLARS,
      keys: Object.keys(FALLBACK_PILLARS),
    };
  }
};

/**
 * Get data for a specific pillar
 * @param {string} pillarKey - The pillar key (stem, wellness, etc.)
 * @returns {Promise<Object>} Pillar data object
 */
export const getPillar = async (pillarKey) => {
  try {
    const response = await api.get(`/api/pillars/${pillarKey}`);
    return response.data.pillar;
  } catch (error) {
    console.warn(`Failed to fetch pillar "${pillarKey}" from API, using fallback:`, error);
    return FALLBACK_PILLARS[pillarKey.toLowerCase()] || FALLBACK_PILLARS.art;
  }
};

/**
 * Get pillar color
 * @param {string} pillarKey - The pillar key
 * @returns {Promise<string>} Pillar color hex code
 */
export const getPillarColor = async (pillarKey) => {
  const pillar = await getPillar(pillarKey);
  return pillar.color;
};

/**
 * Get pillar display name
 * @param {string} pillarKey - The pillar key
 * @returns {Promise<string>} Pillar display name
 */
export const getPillarDisplayName = async (pillarKey) => {
  const pillar = await getPillar(pillarKey);
  return pillar.display_name;
};

/**
 * Get pillar gradient
 * @param {string} pillarKey - The pillar key
 * @returns {Promise<string>} Pillar gradient Tailwind classes
 */
export const getPillarGradient = async (pillarKey) => {
  const pillar = await getPillar(pillarKey);
  return pillar.gradient;
};

/**
 * Get pillar icon name
 * @param {string} pillarKey - The pillar key
 * @returns {Promise<string>} Pillar icon name (HeroIcon)
 */
export const getPillarIcon = async (pillarKey) => {
  const pillar = await getPillar(pillarKey);
  return pillar.icon;
};

/**
 * Validate if a pillar key is valid
 * @param {string} pillarKey - The pillar key to validate
 * @returns {Promise<boolean>} True if valid, false otherwise
 */
export const isValidPillar = async (pillarKey) => {
  try {
    const response = await api.get(`/api/pillars/validate/${pillarKey}`);
    return response.data.valid;
  } catch (error) {
    console.warn(`Failed to validate pillar "${pillarKey}", checking locally:`, error);
    return pillarKey.toLowerCase() in FALLBACK_PILLARS;
  }
};

/**
 * Clear the pillar cache (useful after updates)
 */
export const clearPillarCache = () => {
  pillarCache = null;
  cacheTimestamp = null;
};

/**
 * Get pillar data synchronously from cache or fallback
 * WARNING: This should only be used when async is not possible
 * Prefer using getAllPillars() or getPillar() instead
 *
 * @param {string} pillarKey - The pillar key
 * @returns {Object} Pillar data object
 */
export const getPillarSync = (pillarKey) => {
  // Try cache first
  if (pillarCache?.pillars?.[pillarKey.toLowerCase()]) {
    return pillarCache.pillars[pillarKey.toLowerCase()];
  }

  // Fall back to hardcoded data
  return FALLBACK_PILLARS[pillarKey.toLowerCase()] || FALLBACK_PILLARS.art;
};

export default {
  getAllPillars,
  getPillar,
  getPillarColor,
  getPillarDisplayName,
  getPillarGradient,
  getPillarIcon,
  isValidPillar,
  clearPillarCache,
  getPillarSync,
};
