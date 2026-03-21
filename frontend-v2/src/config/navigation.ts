/**
 * Navigation config - Single source of truth for all nav items.
 * Used by both the desktop Sidebar and mobile Tabs.
 *
 * Mobile center tab is the Capture button (modal trigger, not a route).
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
  { key: 'dashboard', label: 'Home', icon: 'home-outline', iconActive: 'home', href: '/(app)/(tabs)/dashboard', platforms: ['web'] },
  { key: 'courses', label: 'Courses', icon: 'school-outline', iconActive: 'school', href: '/(app)/(tabs)/courses', platforms: ['web'] },
  { key: 'quests', label: 'Quests', icon: 'rocket-outline', iconActive: 'rocket', href: '/(app)/(tabs)/quests', platforms: ['web'] },
  { key: 'bounties', label: 'Bounties', icon: 'flag-outline', iconActive: 'flag', href: '/(app)/(tabs)/bounties', platforms: ['web', 'mobile'] },
  { key: 'buddy', label: 'Buddy', icon: 'heart-outline', iconActive: 'heart', href: '/(app)/(tabs)/buddy', platforms: ['web', 'mobile'] },
  { key: 'feed', label: 'Feed', icon: 'newspaper-outline', iconActive: 'newspaper', href: '/(app)/(tabs)/feed', platforms: ['web', 'mobile'] },
  { key: 'journal', label: 'Journal', icon: 'book-outline', iconActive: 'book', href: '/(app)/(tabs)/journal', platforms: ['web', 'mobile'] },
  { key: 'family', label: 'Family', icon: 'people-outline', iconActive: 'people', href: '/(app)/(tabs)/family', platforms: [] },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person', href: '/(app)/(tabs)/profile', platforms: [] },
  { key: 'advisor', label: 'Advisor', icon: 'clipboard-outline', iconActive: 'clipboard', href: '/(app)/(tabs)/advisor', platforms: ['web'] },
  { key: 'admin', label: 'Admin', icon: 'shield-outline', iconActive: 'shield', href: '/(app)/(tabs)/admin', platforms: ['web'] },
];

/**
 * Mobile tab order: Feed, Journal, [+ Capture], Buddy, Bounties
 * 'capture' is a special key -- not a route, triggers a modal.
 */
export const mobileTabOrder = ['feed', 'journal', 'capture', 'buddy', 'bounties'];

/** Items visible in desktop sidebar */
export const desktopNavItems = navItems.filter((n) => n.platforms.includes('web'));

/** Items visible in mobile tab bar (ordered, excluding 'capture' which is handled specially) */
export const mobileNavItems = mobileTabOrder
  .filter((key) => key !== 'capture')
  .map((key) => navItems.find((n) => n.key === key)!)
  .filter(Boolean);

/** Items that exist as routes but are hidden from mobile tabs */
export const hiddenMobileRoutes = navItems
  .filter((n) => !mobileTabOrder.includes(n.key) || !n.platforms.includes('mobile'))
  .map((n) => n.key);
