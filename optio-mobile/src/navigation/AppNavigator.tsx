/**
 * App Navigator - Bottom tabs + stack navigation.
 *
 * Full Mode (11-17): 5 tabs - Journal, Feed, Home (center logo), Bounties, Profile
 * Kid Mode (5-10): 3 tabs - Home (Yeti), Capture, Feed
 *
 * The Home tab uses the Optio logo as a raised center button with a notched
 * tab bar that curves around it.
 */

import React from 'react';
import { View, Text, StyleSheet, Platform, TouchableOpacity, Dimensions } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import Svg, { Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { tokens } from '../theme/tokens';
import { icons } from '../theme/icons';
import { useThemeStore } from '../stores/themeStore';
import { OptioLogo } from '../components/common/OptioLogo';

import { HomeScreen } from '../screens/HomeScreen';
import { LoginScreen } from '../screens/LoginScreen';
import { JournalScreen } from '../screens/JournalScreen';
import { CaptureScreen } from '../screens/CaptureScreen';
import { FeedScreen } from '../screens/FeedScreen';
import { OverviewScreen } from '../screens/OverviewScreen';
import { ShopScreen } from '../screens/ShopScreen';
import { ProfileScreen } from '../screens/ProfileScreen';
import { BountyBoardScreen } from '../screens/BountyBoardScreen';
import { BountyDetailScreen } from '../screens/BountyDetailScreen';
import { FeedDetailScreen } from '../screens/FeedDetailScreen';
import { JournalDetailScreen } from '../screens/JournalDetailScreen';

import { useAuthStore } from '../stores/authStore';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const SCREEN_W = Dimensions.get('window').width;
const LOGO_SIZE = 56;
const NOTCH_GAP = 4;                          // space between logo edge and bar edge
const NOTCH_R = LOGO_SIZE / 2 + NOTCH_GAP;    // arc radius that hugs the logo
const TAB_BAR_HEIGHT = 56;

function tabIconName(route: string, focused: boolean): keyof typeof Ionicons.glyphMap {
  const map: Record<string, { active: string; inactive: string }> = {
    Home: { active: icons.home.name, inactive: icons.home.outline },
    Journal: { active: icons.journal.name, inactive: icons.journal.outline },
    Bounties: { active: icons.bounties.name, inactive: icons.bounties.outline },
    Feed: { active: icons.feed.name, inactive: icons.feed.outline },
    Profile: { active: icons.profile.name, inactive: icons.profile.outline },
    Capture: { active: icons.capture.name, inactive: icons.capture.outline },
  };
  const entry = map[route] || { active: 'ellipse', inactive: 'ellipse-outline' };
  return (focused ? entry.active : entry.inactive) as keyof typeof Ionicons.glyphMap;
}

function getAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function isKidMode(user: { date_of_birth: string | null; is_dependent: boolean } | null): boolean {
  if (!user) return false;
  if (user.is_dependent) {
    const age = getAge(user.date_of_birth);
    if (age !== null && age <= 10) return true;
  }
  return false;
}

/**
 * Builds an SVG path for the tab bar background. The top edge is flat except
 * in the center where it arcs upward following the circular logo outline.
 *
 * barTop = NOTCH_R so the arc peak (y=0) fits inside the SVG.
 * The arc is a semicircle of radius NOTCH_R, tracing the logo's circle + gap.
 */
function notchedBarPath(width: number, totalHeight: number): string {
  const mid = width / 2;
  const barTop = NOTCH_R; // flat bar top y-coordinate

  return [
    `M0,${barTop}`,                         // top-left at flat bar level
    `L${mid - NOTCH_R},${barTop}`,           // flat to left edge of arc
    `A${NOTCH_R},${NOTCH_R} 0 0,0 ${mid + NOTCH_R},${barTop}`, // arc up over logo
    `L${width},${barTop}`,                   // flat to right edge
    `L${width},${totalHeight}`,              // down right side
    `L0,${totalHeight}`,                     // across bottom
    'Z',
  ].join(' ');
}

function CustomTabBar({ state, descriptors, navigation }: any) {
  const { colors } = useThemeStore();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === 'web' ? 6 : insets.bottom;
  const svgTotalH = NOTCH_R + TAB_BAR_HEIGHT + bottomPadding;
  const containerH = svgTotalH;

  const centerIndex = Math.floor(state.routes.length / 2);

  return (
    <View style={[styles.tabBarOuter, { height: containerH }]}>
      {/* SVG background with arc */}
      <Svg width={SCREEN_W} height={svgTotalH} style={styles.tabBarSvg}>
        <Path d={notchedBarPath(SCREEN_W, svgTotalH)} fill={colors.tabBar} />
      </Svg>

      {/* Raised center logo -- centered at barTop (NOTCH_R from top), so top = NOTCH_GAP */}
      <View style={[styles.logoContainer, { top: NOTCH_GAP }]}>
        <TouchableOpacity
          style={styles.logoBubble}
          onPress={() => {
            const route = state.routes[centerIndex];
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          }}
          accessibilityRole="button"
          accessibilityLabel="Home"
        >
          <OptioLogo size={LOGO_SIZE} />
        </TouchableOpacity>
      </View>

      {/* Tab buttons sit below the arc */}
      <View style={[styles.tabRow, { height: TAB_BAR_HEIGHT, marginTop: NOTCH_R, paddingBottom: bottomPadding }]}>
        {state.routes.map((route: any, index: number) => {
          const { options } = descriptors[route.key];
          const isFocused = state.index === index;
          const isCenter = index === centerIndex;

          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name);
            }
          };

          if (isCenter) {
            // Center slot: just the label below the raised logo
            return (
              <TouchableOpacity
                key={route.key}
                style={styles.tabItem}
                onPress={onPress}
                accessibilityRole="button"
                accessibilityState={{ selected: isFocused }}
              >
                <View style={{ height: 28 }} />
                <Text style={[
                  styles.tabLabel,
                  { color: isFocused ? colors.primary : colors.textMuted },
                ]}>
                  Home
                </Text>
              </TouchableOpacity>
            );
          }

          const label = typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : route.name;

          return (
            <TouchableOpacity
              key={route.key}
              style={styles.tabItem}
              onPress={onPress}
              accessibilityRole="button"
              accessibilityState={{ selected: isFocused }}
            >
              <Ionicons
                name={tabIconName(route.name, isFocused)}
                size={24}
                color={isFocused ? colors.primary : colors.textMuted}
              />
              <Text style={[
                styles.tabLabel,
                { color: isFocused ? colors.primary : colors.textMuted },
              ]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

function KidTabs() {
  const { colors } = useThemeStore();
  return (
    <Tab.Navigator screenOptions={({ route }) => ({
      headerShown: false,
      tabBarActiveTintColor: colors.primary,
      tabBarInactiveTintColor: colors.textMuted,
      tabBarStyle: {
        backgroundColor: colors.tabBar,
        borderTopColor: colors.glass.borderLight,
        borderTopWidth: 0.5,
        elevation: 0,
        height: 70,
        paddingBottom: 8,
      },
      tabBarLabelStyle: { fontSize: 13, fontWeight: '600' as const },
      tabBarIcon: ({ focused, size, color }) => {
        const name = tabIconName(route.name, focused);
        return <Ionicons name={name} size={size} color={color} />;
      },
    })}>
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Buddy' }} />
      <Tab.Screen name="Capture" component={CaptureScreen} options={{ tabBarLabel: 'Capture' }} />
      <Tab.Screen name="Feed" component={FeedScreen} options={{ tabBarLabel: 'Feed' }} />
    </Tab.Navigator>
  );
}

function FullTabs() {
  return (
    <Tab.Navigator
      initialRouteName="Home"
      tabBar={(props) => <CustomTabBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tab.Screen name="Journal" component={JournalScreen} options={{ tabBarLabel: 'Journal' }} />
      <Tab.Screen name="Feed" component={FeedScreen} options={{ tabBarLabel: 'Feed' }} />
      <Tab.Screen name="Home" component={HomeScreen} options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Bounties" component={BountyBoardScreen} options={{ tabBarLabel: 'Bounties' }} />
      <Tab.Screen name="Profile" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}

function MainStack() {
  const { user } = useAuthStore();
  const kidMode = isKidMode(user);

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={kidMode ? KidTabs : FullTabs} />
      <Stack.Screen name="Shop" component={ShopScreen} />
      <Stack.Screen name="Progress" component={OverviewScreen} />
      <Stack.Screen name="BountyDetail" component={BountyDetailScreen} />
      <Stack.Screen name="FeedDetail" component={FeedDetailScreen} />
      <Stack.Screen name="JournalDetail" component={JournalDetailScreen} />
      <Stack.Screen name="Capture" component={CaptureScreen} />
    </Stack.Navigator>
  );
}

export function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return null;
  }

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      {isAuthenticated ? (
        <Stack.Screen name="Main" component={MainStack} />
      ) : (
        <Stack.Screen name="Login" component={LoginScreen} />
      )}
    </Stack.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBarOuter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
  },
  tabBarSvg: {
    position: 'absolute',
    bottom: 0,
    left: 0,
  },
  logoContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  logoBubble: {
    width: LOGO_SIZE,
    height: LOGO_SIZE,
    borderRadius: LOGO_SIZE / 2,
    overflow: 'hidden',
  },
  tabRow: {
    flexDirection: 'row',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: tokens.typography.fonts.medium,
    marginTop: 2,
  },
});
