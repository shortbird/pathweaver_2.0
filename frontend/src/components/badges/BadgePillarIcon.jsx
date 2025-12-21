import { HeartIcon, ChatBubbleLeftRightIcon, GlobeAltIcon, PaintBrushIcon } from '@heroicons/react/24/outline';

/**
 * Maps pillar names to their corresponding Lucide React icons
 * @param {string} pillar - The name of the pillar
 * @returns {React.Component} The corresponding icon component
 */
export function getBadgePillarIcon(pillar) {
  const iconMap = {
    'STEM & Logic': Atom,
    'Life & Wellness': Heart,
    'Language & Communication': MessageSquare,
    'Society & Culture': Globe,
    'Arts & Creativity': Palette
  };

  return iconMap[pillar] || Atom; // Default to Atom if pillar not found
}

/**
 * BadgePillarIcon component - renders the appropriate icon for a given pillar
 * @param {string} pillar - The pillar name
 * @param {string} className - Additional CSS classes to apply
 */
export function BadgePillarIcon({ pillar, className = "w-16 h-16" }) {
  const Icon = getBadgePillarIcon(pillar);
  return <Icon className={className} />;
}
