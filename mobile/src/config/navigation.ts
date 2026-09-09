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
 * Mobile tab order for the default (student) shell: Home, Journal, [+ Capture], Bounties, Feed.
 * - 'capture' is a special key (not a route — triggers the CaptureSheet modal)
 * - Home replaces Feed-as-landing: active quests, next-up tasks, learning rhythm
 * - Journal subsumes Quests on mobile (quest discovery + creation lives inside Journal now)
 * - Bounties is the student's "chase / earn" surface. It was previously a hidden
 *   deep-link even though parents and observers already had it as a tab —
 *   promoting it here makes the earning loop first-class and consistent across
 *   roles (see parentMobileTabOrder / observerTabOrder).
 * - Feed lives in the tab bar because it's a daily/social surface
 * - Messages is notification-driven, not a browse destination, so it moved out
 *   of the tab bar to a chat icon in the mobile PageHeader (next to the
 *   notification bell); its unread badge moved with it. It stays a registered
 *   route for deep links.
 * - Profile is reached by tapping the avatar in the Home welcome header
 *   (standard mobile pattern); it stays a registered route for deep links.
 * - Quests remains a route (deep-link from Home / Journal); not a bottom tab
 *   because the journal+quest merger gives students a single surface for both
 *   browsing and capturing.
 * Parent and observer roles override this in app/(app)/(tabs)/_layout.tsx.
 */
export const mobileTabOrder = ['dashboard', 'journal', 'capture', 'bounties', 'feed'];

/** Mobile tab order for parents. 'capture' is the center button, handled the
 *  same way as in the student shell — it triggers the CaptureSheet modal in
 *  parent mode (multi-select which kid(s) the moment is for).
 *
 *  Journal replaced Messages here on 2026-08-18. Parents had no Journal tab at
 *  all, which on mobile is the surface quest discovery and capture live on, and
 *  Messages was the odd one out: it is notification-driven rather than a browse
 *  destination, which is exactly why it sits in the header for students. Moving
 *  it up freed the slot Journal needed and made the two shells consistent.
 *
 *  This pairs with `showMessages` in components/layouts/MobileHeader.tsx — the
 *  chat icon is shown iff Messages is NOT in the bar. Change one without the
 *  other and parents get both surfaces or neither. */
export const parentMobileTabOrder = ['family', 'journal', 'capture', 'bounties', 'feed'];

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
