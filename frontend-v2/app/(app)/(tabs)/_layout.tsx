import { useEffect, useState } from 'react';
import { Tabs, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { View, Image, Pressable } from 'react-native';
import { useColorScheme } from 'nativewind';
import { Sidebar } from '@/src/components/layouts/Sidebar';
import { ActingAsBanner } from '@/src/components/layouts/ActingAsBanner';
import { CaptureSheet } from '@/src/components/capture/CaptureSheet';
import { StartSomethingFab } from '@/src/components/ui/StartSomethingFab';
import { ParentStartSomethingFab } from '@/src/components/ui/ParentStartSomethingFab';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore } from '@/src/stores/previewRoleStore';
import { useCaptureContextStore } from '@/src/stores/captureContextStore';
import { useStartSomethingStore } from '@/src/stores/startSomethingStore';
import { useParentStartSomethingStore } from '@/src/stores/parentStartSomethingStore';
import { useIsObserver, useIsParent } from '@/src/hooks/useStartSomething';
import { UIText } from '@/src/components/ui/text';
import { mobileNavItems, hiddenMobileRoutes, navItems, mobileTabOrder, parentMobileTabOrder } from '@/src/config/navigation';
import { useUIStore } from '@/src/stores/uiStore';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { useThemeColors } from '@/src/hooks/useThemeColors';

// Q5: canonical Optio logo is the Supabase-hosted gradient_fav.svg — same asset
// used by v1 (frontend/index.html, TopNavbar.jsx, manifest.json) and by other
// v2 screens (onboarding.tsx, feed.tsx). Keep these in lockstep.
const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const optioIcon = require('@/assets/images/icon.png');

/** Minimal header for observers on web — logo + sign out, no sidebar */
function ObserverHeader() {
  const { user, logout } = useAuthStore();
  const c = useThemeColors();
  return (
    <View className="bg-white dark:bg-dark-surface-50 border-b border-surface-200 dark:border-dark-surface-300 px-6 py-3 flex-row items-center justify-between">
      <Image source={{ uri: LOGO_URI }} style={{ width: 110, height: 34 }} resizeMode="contain" />
      <Pressable onPress={logout} className="flex-row items-center gap-2 active:opacity-70">
        <Ionicons name="person-circle-outline" size={20} color={c.icon} />
        <UIText size="sm" className="text-typo-500 font-poppins-medium dark:text-dark-typo-500">
          {user?.display_name || user?.first_name || user?.email}
        </UIText>
        <Ionicons name="log-out-outline" size={18} color={c.iconMuted} />
      </Pressable>
    </View>
  );
}

export default function TabsLayout() {
  const { isDesktop } = useBreakpoint();
  const [captureVisible, setCaptureVisible] = useState(false);
  const isObserver = useIsObserver();
  const isParent = useIsParent();
  const restorePreviewRole = usePreviewRoleStore((s) => s.restore);
  const { colorScheme } = useColorScheme();
  const isDark = colorScheme === 'dark';
  const c = useThemeColors();
  const tabBarHidden = useUIStore((s) => s.tabBarHidden);
  // Quest detail screens publish their quest into this store while focused, so
  // the global Capture button can open the sheet pre-scoped to that quest.
  const questCaptureContext = useCaptureContextStore((s) => s.quest);

  // Restore persisted preview state on first mount (web only)
  useEffect(() => {
    restorePreviewRole();
  }, [restorePreviewRole]);

  // ── Observer: feed + center "+" + bounties, minimal chrome ──
  // The center Optio button routes straight to /bounties/create. Observers'
  // only authoring action is posting bounties for the students they follow,
  // so a sheet of one item is overkill.
  const observerTabOrder = ['feed', 'capture', 'bounties'];
  if (isObserver) {
    return (
      <View className="flex-1 bg-surface-50 dark:bg-dark-surface">
        {isDesktop && <ObserverHeader />}
        <ActingAsBanner />
        <Tabs
          initialRouteName="feed"
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#6D469B',
            tabBarInactiveTintColor: c.iconMuted,
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
          {observerTabOrder.map((key) => {
            if (key === 'capture') {
              return (
                <Tabs.Screen
                  key="capture"
                  name="capture"
                  listeners={{
                    tabPress: (e) => {
                      e.preventDefault();
                      router.push('/(app)/bounties/create');
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
                          boxShadow: '0 3px 6px rgba(109, 70, 155, 0.25)',
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
          {/* Register all other routes but hide them */}
          {navItems.filter((n) => !observerTabOrder.includes(n.key)).map((n) => (
            <Tabs.Screen key={n.key} name={n.key} options={{ href: null }} />
          ))}
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
        <CaptureSheet
          visible={captureVisible}
          onClose={() => setCaptureVisible(false)}
          questContext={questCaptureContext || undefined}
        />
        {/* Headless Start-something host on desktop too, so the Home FAB (and
            any CTA) can open the same role-specific action sheet the mobile
            center tab button does. Mobile mounts its own host below. */}
        {isParent ? (
          <ParentStartSomethingFab onCaptureMoment={() => setCaptureVisible(true)} />
        ) : (
          <StartSomethingFab onCaptureMoment={() => setCaptureVisible(true)} />
        )}
      </View>
    );
  }

  // ── Mobile parent: family + feed + center capture + bounties + messages ──
  if (isParent) {
    return (
      <View className="flex-1 bg-surface-50 dark:bg-dark-surface">
        <ActingAsBanner />
        <Tabs
          initialRouteName="family"
          screenOptions={{
            headerShown: false,
            tabBarActiveTintColor: '#6D469B',
            tabBarInactiveTintColor: c.iconMuted,
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
            // Center Optio button — opens the parent action sheet (Post a
            // bounty / Capture a moment / Manage observers / Add a kid).
            // Replaces the old floating "+" FAB; same actions, single
            // primary affordance.
            if (key === 'capture') {
              return (
                <Tabs.Screen
                  key="capture"
                  name="capture"
                  listeners={{
                    tabPress: (e) => {
                      e.preventDefault();
                      useParentStartSomethingStore.getState().open();
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
                          boxShadow: '0 3px 6px rgba(109, 70, 155, 0.25)',
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

        {/* Parent action-sheet mount — headless host for the parent action
            sheet + Manage observers + Add kid sheets. The center tab opens
            these via useParentStartSomethingStore; no visible FAB anymore. */}
        <ParentStartSomethingFab
          onCaptureMoment={() => setCaptureVisible(true)}
        />
      </View>
    );
  }

  // ── Mobile: tabs with center capture button ──
  return (
    <View className="flex-1 bg-surface-50 dark:bg-dark-surface">
      <ActingAsBanner />
      <Tabs
        initialRouteName="dashboard"
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#6D469B',
          tabBarInactiveTintColor: c.iconMuted,
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
          // Center Optio button — opens the student "Start something new"
          // sheet (Capture a moment / Browse quests / Create quest / Earn
          // bounty / Start class). Replaces the old floating "+" FAB.
          if (key === 'capture') {
            return (
              <Tabs.Screen
                key="capture"
                name="capture"
                listeners={{
                  tabPress: (e) => {
                    e.preventDefault();
                    useStartSomethingStore.getState().open();
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
                        boxShadow: '0 3px 6px rgba(109, 70, 155, 0.25)',
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
      <CaptureSheet
        visible={captureVisible}
        onClose={() => setCaptureVisible(false)}
        questContext={questCaptureContext || undefined}
      />

      {/* Student action-sheet mount — headless host for StartSomethingSheet +
          CreateQuestSheet + CreateClassSheet. The center tab opens these via
          useStartSomethingStore; no visible FAB anymore. */}
      <StartSomethingFab onCaptureMoment={() => setCaptureVisible(true)} />
    </View>
  );
}
