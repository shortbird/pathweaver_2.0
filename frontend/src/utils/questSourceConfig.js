// Quest source configuration and mappings

export const QUEST_SOURCES = {
  optio: 'Optio',
  khan_academy: 'Khan Academy',
  brilliant: 'Brilliant',
  coursera: 'Coursera',
  edx: 'edX',
  udemy: 'Udemy',
  duolingo: 'Duolingo',
  codecademy: 'Codecademy',
  custom: 'Custom'
}

// Map sources to their fallback header images (used only if admin hasn't uploaded custom ones)
export const SOURCE_IMAGES = {
  optio: '/images/headers/optio-header.png',
  khan_academy: '/images/headers/khan-academy-header.png',
  brilliant: '/images/headers/brilliant-header.png',
  coursera: '/images/headers/coursera-header.png',
  edx: '/images/headers/edx-header.png',
  udemy: '/images/headers/udemy-header.png',
  duolingo: '/images/headers/duolingo-header.png',
  codecademy: '/images/headers/codecademy-header.png',
  custom: '/images/headers/custom-header.png'
}

// Cache for fetched source data to avoid repeated API calls
let sourcesCache = null;
let cacheTimestamp = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Fetch quest sources from API with caching
const fetchQuestSources = async () => {
  const now = Date.now();
  
  // Return cached data if it's still fresh
  if (sourcesCache && cacheTimestamp && (now - cacheTimestamp) < CACHE_DURATION) {
    return sourcesCache;
  }
  
  try {
    const apiBase = import.meta.env.VITE_API_URL || '';

    const response = await fetch(`${apiBase}/api/quests/sources`, {
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include' // Send cookies for authentication
    });
    
    // If request fails (e.g., not authenticated), return empty array to use fallbacks
    if (!response.ok) {
      console.warn('Could not fetch quest sources, using fallback images');
      return [];
    }
    
    const data = await response.json();
    sourcesCache = data.sources || [];
    cacheTimestamp = now;
    
    return sourcesCache;
  } catch (error) {
    console.warn('Error fetching quest sources:', error);
    return [];
  }
};

// Function to get header image for a quest based on its source
export const getQuestHeaderImage = async (quest) => {
  if (!quest) return SOURCE_IMAGES.optio;
  
  // If quest has a custom header image, use that first
  if (quest.header_image_url) {
    return quest.header_image_url;
  }
  
  // If quest has a custom banner image (legacy field), use that
  if (quest.quest_banner_image) {
    return quest.quest_banner_image;
  }
  
  // Otherwise, try to get the uploaded source image from admin panel
  const source = quest.source || 'optio';
  const normalizedSource = source === '' ? 'optio' : source;
  
  try {
    const sources = await fetchQuestSources();
    const sourceData = sources.find(s => s.id === normalizedSource);
    
    // If we found the source and it has an uploaded header image, use that
    if (sourceData && sourceData.header_image_url) {
      return sourceData.header_image_url;
    }
  } catch (error) {
    console.warn('Error getting source image:', error);
  }
  
  // Fall back to hardcoded images
  return SOURCE_IMAGES[normalizedSource] || SOURCE_IMAGES.optio;
}

// Synchronous version for when we need immediate response (uses cache or fallback)
export const getQuestHeaderImageSync = (quest) => {
  if (!quest) return SOURCE_IMAGES.optio;
  
  // If quest has a custom header image, use that first
  if (quest.header_image_url) {
    return quest.header_image_url;
  }
  
  // If quest has a custom banner image (legacy field), use that
  if (quest.quest_banner_image) {
    return quest.quest_banner_image;
  }
  
  // Check cached source data
  const source = quest.source || 'optio';
  const normalizedSource = source === '' ? 'optio' : source;
  
  if (sourcesCache) {
    const sourceData = sourcesCache.find(s => s.id === normalizedSource);
    if (sourceData && sourceData.header_image_url) {
      return sourceData.header_image_url;
    }
  }
  
  // Fall back to hardcoded images
  return SOURCE_IMAGES[normalizedSource] || SOURCE_IMAGES.optio;
}

// Function to detect source from title or description
export const detectQuestSource = (title, description) => {
  const text = `${title} ${description}`.toLowerCase();
  
  if (text.includes('khan academy')) return 'khan_academy';
  if (text.includes('coursera')) return 'coursera';
  if (text.includes('edx')) return 'edx';
  if (text.includes('udemy')) return 'udemy';
  if (text.includes('brilliant')) return 'brilliant';
  if (text.includes('duolingo')) return 'duolingo';
  if (text.includes('codecademy')) return 'codecademy';
  
  return 'optio'; // Default
}