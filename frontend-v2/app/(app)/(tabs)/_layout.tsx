import { useState } from 'react';
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, useWindowDimensions, View, Image } from 'react-native';
import { Sidebar } from '@/src/components/layouts/Sidebar';
import { CaptureSheet } from '@/src/components/capture/CaptureSheet';
import { mobileNavItems, hiddenMobileRoutes, navItems, mobileTabOrder } from '@/src/config/navigation';

const DESKTOP_BREAKPOINT = 768;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const optioIcon = require('@/assets/images/icon.png');

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const [captureVisible, setCaptureVisible] = useState(false);

  if (isDesktop) {
    return (
      <View className="flex-1 flex-row bg-surface-50">
        <Sidebar />
        <View className="flex-1">
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
          </Tabs>
        </View>
        <CaptureSheet visible={captureVisible} onClose={() => setCaptureVisible(false)} />
      </View>
    );
  }

  // Mobile tabs with center capture button
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: '#6D469B',
          tabBarInactiveTintColor: '#9CA3AF',
          tabBarLabelStyle: {
            fontFamily: 'Poppins_500Medium',
            fontSize: 11,
          },
          tabBarStyle: {
            height: 85,
            paddingBottom: 20,
            borderTopColor: '#E5E7EB',
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
                        shadowColor: '#6D469B',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.3,
                        shadowRadius: 8,
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
      </Tabs>
      <CaptureSheet visible={captureVisible} onClose={() => setCaptureVisible(false)} />
    </>
  );
}
