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

// Map sources to their default header images
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

// Function to get header image for a quest based on its source
export const getQuestHeaderImage = (quest) => {
  if (!quest) return SOURCE_IMAGES.optio;
  
  // If quest has a custom header image, use that first
  if (quest.header_image_url) {
    return quest.header_image_url;
  }
  
  // If quest has a custom banner image (legacy field), use that
  if (quest.quest_banner_image) {
    return quest.quest_banner_image;
  }
  
  // Otherwise, use the source-based default
  const source = quest.source || 'optio';
  // Handle empty string source as optio
  const normalizedSource = source === '' ? 'optio' : source;
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