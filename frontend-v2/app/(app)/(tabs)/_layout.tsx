import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Platform, useWindowDimensions, View } from 'react-native';
import { Sidebar } from '@/src/components/layouts/Sidebar';
import { mobileNavItems, hiddenMobileRoutes, navItems } from '@/src/config/navigation';

const DESKTOP_BREAKPOINT = 768;

export default function TabsLayout() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

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
          </Tabs>
        </View>
      </View>
    );
  }

  // Mobile tabs from shared config
  return (
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
      {mobileNavItems.map((item) => (
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
      ))}
      {/* Routes that exist but are hidden from mobile tab bar */}
      {hiddenMobileRoutes.map((key) => (
        <Tabs.Screen key={key} name={key} options={{ href: null }} />
      ))}
    </Tabs>
  );
}
