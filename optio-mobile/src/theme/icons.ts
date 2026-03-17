/**
 * Icon Map - Centralized icon definitions using Ionicons.
 *
 * @expo/vector-icons is bundled with Expo, no install needed.
 * Using Ionicons for a clean, iOS-native feel across the app.
 */

export const icons = {
  // Tab bar
  home: { name: 'home', outline: 'home-outline' },
  journal: { name: 'book', outline: 'book-outline' },
  bounties: { name: 'flag', outline: 'flag-outline' },
  feed: { name: 'newspaper', outline: 'newspaper-outline' },
  profile: { name: 'person', outline: 'person-outline' },
  capture: { name: 'camera', outline: 'camera-outline' },
  shop: { name: 'cart', outline: 'cart-outline' },
  progress: { name: 'stats-chart', outline: 'stats-chart-outline' },

  // Actions
  photo: 'camera-outline',
  voice: 'mic-outline',
  text: 'create-outline',
  add: 'add',
  close: 'close',
  back: 'chevron-back',
  send: 'send',
  search: 'search',
  filter: 'funnel-outline',
  refresh: 'refresh',
  settings: 'settings-outline',
  logout: 'log-out-outline',

  // Yeti / shop
  hunger: 'restaurant-outline',
  happiness: 'happy-outline',
  energy: 'flash-outline',
  xp: 'diamond-outline',
  buy: 'bag-add-outline',

  // Bounty
  claim: 'hand-right-outline',
  submit: 'cloud-upload-outline',
  deadline: 'time-outline',
  reward: 'trophy-outline',
  sponsored: 'ribbon-outline',

  // Feed / social
  like: 'heart-outline',
  likeFilled: 'heart',
  comment: 'chatbubble-outline',
  share: 'share-outline',

  // Reactions
  proud: 'star',
  mind_blown: 'flash',
  inspired: 'bulb',
  love_it: 'heart',
  curious: 'search',

  // Capture modes
  photoMode: 'camera',
  voiceMode: 'mic',
  textMode: 'create',

  // Status
  check: 'checkmark-circle',
  warning: 'warning',
  error: 'alert-circle',
  info: 'information-circle',
  pending: 'hourglass-outline',

  // Misc
  invite: 'person-add-outline',
  remove: 'trash-outline',
  edit: 'pencil',
  link: 'link-outline',
  calendar: 'calendar-outline',

  // Pillars
  stem: 'flask-outline',
  art: 'color-palette-outline',
  communication: 'chatbubbles-outline',
  civics: 'globe-outline',
  wellness: 'fitness-outline',
} as const;

/** Category icons for shop items */
export const shopCategoryIcons: Record<string, string> = {
  food: 'nutrition-outline',
  toy: 'game-controller-outline',
  accessory: 'glasses-outline',
};

/** Pillar icon mapping */
export const pillarIcons: Record<string, string> = {
  stem: icons.stem,
  art: icons.art,
  communication: icons.communication,
  civics: icons.civics,
  wellness: icons.wellness,
};
