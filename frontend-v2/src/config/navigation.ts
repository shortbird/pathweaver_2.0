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
  /** If set, only these roles see this item. Superadmin always sees all. */
  roles?: string[];
}

export const navItems: NavItem[] = [
  { key: 'dashboard', label: 'Home', icon: 'home-outline', iconActive: 'home', href: '/(app)/(tabs)/dashboard', platforms: ['web', 'mobile'] },
  { key: 'courses', label: 'Courses', icon: 'school-outline', iconActive: 'school', href: '/(app)/(tabs)/courses', platforms: ['web'] },
  { key: 'quests', label: 'Quests', icon: 'rocket-outline', iconActive: 'rocket', href: '/(app)/(tabs)/quests', platforms: ['web'] },
  { key: 'bounties', label: 'Bounties', icon: 'trophy-outline', iconActive: 'trophy', href: '/(app)/(tabs)/bounties', platforms: ['web', 'mobile'] },
  { key: 'feed', label: 'Feed', icon: 'newspaper-outline', iconActive: 'newspaper', href: '/(app)/(tabs)/feed', platforms: ['web', 'mobile'] },
  { key: 'journal', label: 'Journal', icon: 'book-outline', iconActive: 'book', href: '/(app)/(tabs)/journal', platforms: ['web', 'mobile'] },
  { key: 'family', label: 'Family', icon: 'people-outline', iconActive: 'people', href: '/(app)/(tabs)/family', platforms: ['mobile'] },
  { key: 'profile', label: 'Profile', icon: 'person-outline', iconActive: 'person', href: '/(app)/(tabs)/profile', platforms: ['mobile'] },
  { key: 'messages', label: 'Messages', icon: 'chatbubbles-outline', iconActive: 'chatbubbles', href: '/(app)/(tabs)/messages', platforms: ['web', 'mobile'] },
  { key: 'advisor', label: 'Teacher', icon: 'clipboard-outline', iconActive: 'clipboard', href: '/(app)/(tabs)/advisor', platforms: ['web'], roles: ['advisor', 'org_admin', 'superadmin'] },
  { key: 'admin', label: 'Admin', icon: 'shield-outline', iconActive: 'shield', href: '/(app)/(tabs)/admin', platforms: ['web'], roles: ['superadmin', 'org_admin'] },
];

/**
 * Mobile tab order for the default (student) shell: Home, Journal, [+ Capture], Feed, Messages.
 * - 'capture' is a special key (not a route — triggers the CaptureSheet modal)
 * - Home replaces Feed-as-landing: active quests, next-up tasks, learning rhythm
 * - Journal subsumes Quests on mobile (quest discovery + creation lives inside Journal now)
 * - Feed lives in the tab bar because it's a daily/social surface
 * - Profile is reached by tapping the avatar in the Home welcome header
 *   (standard mobile pattern); it stays a registered route for deep links.
 * - Quests + Bounties remain as routes (deep-link from Home / Journal); they're
 *   not bottom tabs because the journal+quest merger gives students a single
 *   surface for both browsing and capturing.
 * Parent and observer roles override this in app/(app)/(tabs)/_layout.tsx.
 */
export const mobileTabOrder = ['dashboard', 'journal', 'capture', 'feed', 'messages'];

/** Mobile tab order for parents. 'capture' is the center button, handled the
 *  same way as in the student shell — it triggers the CaptureSheet modal in
 *  parent mode (multi-select which kid(s) the moment is for). */
export const parentMobileTabOrder = ['family', 'feed', 'capture', 'bounties', 'messages'];

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
