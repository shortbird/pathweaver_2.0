// Quest source configuration and mappings

export const QUEST_SOURCES = {
  optio: 'Optio',
  khan_academy: 'Khan Academy'
}

// Map sources to their default header images
export const SOURCE_IMAGES = {
  optio: '/images/headers/optio-header.png',
  khan_academy: '/images/headers/khan-academy-header.png'
}

// Function to get header image for a quest based on its source
export const getQuestHeaderImage = (quest) => {
  if (!quest) return SOURCE_IMAGES.optio;
  
  // If quest has a custom banner image, use that
  if (quest.quest_banner_image) {
    return quest.quest_banner_image;
  }
  
  // Otherwise, use the source-based default
  const source = quest.source || 'optio';
  return SOURCE_IMAGES[source] || SOURCE_IMAGES.optio;
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