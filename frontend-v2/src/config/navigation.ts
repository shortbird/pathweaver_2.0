/**
 * Navigation config - Single source of truth for all nav items.
 * Used by both the desktop Sidebar and mobile Tabs.
 */

import { Ionicons } from '@expo/vector-icons';

export interface NavItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconActive: keyof typeof Ionicons.glyphMap;
  href: string;
  platforms: ('web' | 'mobile')[];
}

export const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Home', icon: 'home-outline', iconActive: 'home', href: '/(app)/(tabs)/dashboard', platforms: ['web', 'mobile'] },
  { key: 'courses', label: 'Courses', icon: 'school-outline', iconActive: 'school', href: '/(app)/(tabs)/courses', platforms: ['web'] },
  { key: 'quests', label: 'Quests', icon: 'rocket-outline', iconActive: 'rocket', href: '/(app)/(tabs)/quests', platforms: ['web'] },
  { key: 'bounties', label: 'Bounty Board', icon: 'trophy-outline', iconActive: 'trophy', href: '/(app)/(tabs)/bounties', platforms: ['web', 'mobile'] },
  { key: 'buddy', label: 'Buddy', icon: 'heart-outline', iconActive: 'heart', href: '/(app)/(tabs)/buddy', platforms: ['web', 'mobile'] },
  { key: 'feed', label: 'Feed', icon: 'newspaper-outline', iconActive: 'newspaper', href: '/(app)/(tabs)/feed', platforms: ['web', 'mobile'] },
  { key: 'journal', label: 'Journal', icon: 'book-outline', iconActive: 'book', href: '/(app)/(tabs)/journal', platforms: ['web', 'mobile'] },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person', href: '/(app)/(tabs)/profile', platforms: [] },
  { key: 'admin', label: 'Admin', icon: 'shield-outline', iconActive: 'shield', href: '/(app)/(tabs)/admin', platforms: ['web'] },
];

/** Mobile tab order: Feed, Journal, Home (center), Buddy, Bounties */
export const mobileTabOrder = ['feed', 'journal', 'dashboard', 'buddy', 'bounties'];

/** Items visible in desktop sidebar */
export const desktopNavItems = navItems.filter((n) => n.platforms.includes('web'));

/** Items visible in mobile tab bar (ordered) */
export const mobileNavItems = mobileTabOrder
  .map((key) => navItems.find((n) => n.key === key)!)
  .filter(Boolean);

/** Items that exist as routes but are hidden from mobile tabs */
export const hiddenMobileRoutes = navItems
  .filter((n) => !n.platforms.includes('mobile'))
  .map((n) => n.key);
