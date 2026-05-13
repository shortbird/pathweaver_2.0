import { useEffect, useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, useWindowDimensions, View, Image, Pressable } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Sidebar } from '@/src/components/layouts/Sidebar';
import { MobileHeader } from '@/src/components/layouts/MobileHeader';
import { ActingAsBanner } from '@/src/components/layouts/ActingAsBanner';
import { PreviewRoleBanner } from '@/src/components/layouts/PreviewRoleBanner';
import { CaptureSheet } from '@/src/components/capture/CaptureSheet';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore } from '@/src/stores/previewRoleStore';
import { UIText } from '@/src/components/ui/text';
import { mobileNavItems, hiddenMobileRoutes, navItems, mobileTabOrder, parentMobileTabOrder } from '@/src/config/navigation';
import { useUIStore } from '@/src/stores/uiStore';

const DESKTOP_BREAKPOINT = 768;

// Q5: canonical Optio logo is the Supabase-hosted gradient_fav.svg — same asset
// used by v1 (frontend/index.html, TopNavbar.jsx, manifest.json) and by other
// v2 screens (onboarding.tsx, feed.tsx). Keep these in lockstep.
const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const optioIcon = require('@/assets/images/icon.png');

function useIsObserver() {
  const user = useAuthStore((s) => s.user);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  // Superadmin can preview other role shells without swapping tokens
  if (user?.role === 'superadmin' && previewRole) return previewRole === 'observer';
  if (!user) return false;
  const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
  return role === 'observer';
}

function useIsParent() {
  const user = useAuthStore((s) => s.user);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  if (user?.role === 'superadmin' && previewRole) return previewRole === 'parent';
  if (!user) return false;
  const role = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
  return (
    role === 'parent' ||
    (user as any).has_dependents === true ||
    (user as any).has_linked_students === true
  );
}

/** Minimal header for observers on web — logo + sign out, no sidebar */
function ObserverHeader() {
  const { user, logout } = useAuthStore();
  return (
    <View className="bg-white dark:bg-dark-surface-50 border-b border-surface-200 dark:border-dark-surface-300 px-6 py-3 flex-row items-center justify-between">
      <Image source={{ uri: LOGO_URI }} style={{ width: 110, height: 34 }} resizeMode="contain" />
      <Pressable onPress={logout} className="flex-row items-center gap-2 active:opacity-70">
        <Ionicons name="person-circle-outline" size={20} color="#6B6280" />
        <UIText size="sm" className="text-typo-500 font-poppins-medium">
          {user?.display_name || user?.first_name || user?.email}
        </UIText>
        <Ionicons name="log-out-outline" size={18} color="#9A93A8" />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [captureVisible, setCaptureVisible] = useState(false);
  const isObserver = useIsObserver();
  const isParent = useIsParent();
  const restorePreviewRole = usePreviewRoleStore((s) => s.restore);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const tabBarHidden = useUIStore((s) => s.tabBarHidden);

  // Restore persisted preview role on first mount (web only)
  useEffect(() => {
    restorePreviewRole();
  }, [restorePreviewRole]);

  // ── Observer: feed + bounties, minimal chrome ──
  const observerTabs = ['feed', 'bounties'];
  if (isObserver) {
    return (
      <View className="flex-1 bg-surface-50 dark:bg-dark-surface">
        {isDesktop && <ObserverHeader />}
        <ActingAsBanner />
        <PreviewRoleBanner />
        <Tabs
          initialRouteName="feed"
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#6D469B',
            tabBarInactiveTintColor: '#9A93A8',
            tabBarLabelStyle: {
              fontFamily: 'Poppins_500Medium',
              fontSize: 10,
              letterSpacing: -0.1,
            },
            tabBarItemStyle: {
              paddingHorizontal: 2,
            },
            tabBarStyle: isDesktop
              ? { display: 'none' }
              : {
                  height: 85,
                  paddingBottom: 20,
                  borderTopColor: isDark ? '#3A3A52' : '#E2DCE8',
                  backgroundColor: isDark ? '#1A1A2E' : '#FFFFFF',
                },
          }}
        >
          {observerTabs.map((key) => {
            const item = navItems.find((n) => n.key === key);
            if (!item) return null;
            return (
              <Tabs.Screen
                key={item.key}
                name={item.key}
                options={{
                  title: item.label,
                  tabBarIcon: ({ color, size }) => (
                    <Ionicons name={item.icon} size={size} color={color} />
                  ),
                }}
              />
            );
          })}
          {/* Register all other routes but hide them */}
          {navItems.filter((n) => !observerTabs.includes(n.key)).map((n) => (
            <Tabs.Screen key={n.key} name={n.key} options={{ href: null }} />
          ))}
          <Tabs.Screen name="capture" options={{ href: null }} />
          <Tabs.Screen name="buddy" options={{ href: null }} />
        </Tabs>
      </View>
    );
  }

  // ── Desktop: sidebar + content ──
  if (isDesktop) {
    return (
      <View className="flex-1 flex-row bg-surface-50 dark:bg-dark-surface">
        <Sidebar />
        <View className="flex-1">
          <ActingAsBanner />
        <PreviewRoleBanner />
          <Tabs
            screenOptions={{
              headerShown: false,
              tabBarStyle: { display: 'none' },
            }}
          >
            {navItems.map((item) => (
              <Tabs.Screen key={item.key} name={item.key} />
            ))}
            <Tabs.Screen name="capture" options={{ href: null }} />
            <Tabs.Screen name="buddy" options={{ href: null }} />
          </Tabs>
        </View>
        <CaptureSheet visible={captureVisible} onClose={() => setCaptureVisible(false)} />
      </View>
    );
  }

  // ── Mobile parent: family + feed + center capture + messages ──
  if (isParent) {
    return (
      <View className="flex-1 bg-surface-50 dark:bg-dark-surface">
        <ActingAsBanner />
        <PreviewRoleBanner />
        <Tabs
          initialRouteName="family"
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#6D469B',
            tabBarInactiveTintColor: '#9A93A8',
            tabBarLabelStyle: {
              fontFamily: 'Poppins_500Medium',
              fontSize: 10,
              letterSpacing: -0.1,
            },
            tabBarItemStyle: {
              paddingHorizontal: 2,
            },
            tabBarStyle: tabBarHidden
              ? { display: 'none' as const }
              : {
                  height: 85,
                  paddingBottom: 20,
                  borderTopColor: isDark ? '#3A3A52' : '#E2DCE8',
                  backgroundColor: isDark ? '#1A1A2E' : '#FFFFFF',
                },
          }}
        >
          {parentMobileTabOrder.map((key) => {
            // Center capture button — opens CaptureSheet with kid multi-select
            if (key === 'capture') {
              return (
                <Tabs.Screen
                  key="capture"
                  name="capture"
                  listeners={{
                    tabPress: (e) => {
                      e.preventDefault();
                      setCaptureVisible(true);
                    },
                  }}
                  options={{
                    title: '',
                    tabBarIcon: () => (
                      <View
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 26,
                          marginTop: -20,
                          boxShadow: '0 4px 8px rgba(109, 70, 155, 0.3)',
                          elevation: 8,
                        }}
                      >
                        <Image
                          source={optioIcon}
                          style={{ width: 52, height: 52, borderRadius: 26 }}
                        />
                      </View>
                    ),
                  }}
                />
              );
            }

            const item = navItems.find((n) => n.key === key);
            if (!item) return null;
            return (
              <Tabs.Screen
                key={item.key}
                name={item.key}
                options={{
                  title: item.label,
                  tabBarIcon: ({ color, size }) => (
                    <Ionicons name={item.icon} size={size} color={color} />
                  ),
                }}
              />
            );
          })}
          {/* Hide all other routes */}
          {navItems.filter((n) => !parentMobileTabOrder.includes(n.key)).map((n) => (
            <Tabs.Screen key={n.key} name={n.key} options={{ href: null }} />
          ))}
          <Tabs.Screen name="buddy" options={{ href: null }} />
        </Tabs>
        <CaptureSheet
          visible={captureVisible}
          onClose={() => setCaptureVisible(false)}
          pickStudents
        />
      </View>
    );
  }

  // ── Mobile: tabs with center capture button ──
  return (
    <>
      <ActingAsBanner />
      <PreviewRoleBanner />
      <Tabs
        initialRouteName="feed"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#6D469B',
          tabBarInactiveTintColor: '#9A93A8',
          tabBarLabelStyle: {
            fontFamily: 'Poppins_500Medium',
            fontSize: 10,
            letterSpacing: -0.1,
          },
          tabBarItemStyle: {
            paddingHorizontal: 2,
          },
          tabBarStyle: tabBarHidden
            ? { display: 'none' as const }
            : {
                height: 85,
                paddingBottom: 20,
                borderTopColor: isDark ? '#3A3A52' : '#E2DCE8',
                backgroundColor: isDark ? '#1A1A2E' : '#FFFFFF',
              },
        }}
      >
        {mobileTabOrder.map((key) => {
          // Center capture button
          if (key === 'capture') {
            return (
              <Tabs.Screen
                key="capture"
                name="capture"
                listeners={{
                  tabPress: (e) => {
                    e.preventDefault();
                    setCaptureVisible(true);
                  },
                }}
                options={{
                  title: '',
                  tabBarIcon: () => (
                    <View
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 26,
                        marginTop: -20,
                        boxShadow: '0 4px 8px rgba(109, 70, 155, 0.3)',
                        elevation: 8,
                      }}
                    >
                      <Image
                        source={optioIcon}
                        style={{ width: 52, height: 52, borderRadius: 26 }}
                      />
                    </View>
                  ),
                }}
              />
            );
          }

          // Regular tab
          const item = navItems.find((n) => n.key === key);
          if (!item) return null;
          return (
            <Tabs.Screen
              key={item.key}
              name={item.key}
              options={{
                title: item.label,
                tabBarIcon: ({ color, size }) => (
                  <Ionicons name={item.icon} size={size} color={color} />
                ),
              }}
            />
          );
        })}
        {/* Routes that exist but are hidden from mobile tabs */}
        {hiddenMobileRoutes.map((key) => (
          <Tabs.Screen key={key} name={key} options={{ href: null }} />
        ))}
        <Tabs.Screen name="buddy" options={{ href: null }} />
      </Tabs>
      <CaptureSheet visible={captureVisible} onClose={() => setCaptureVisible(false)} />
    </>
  );
}
