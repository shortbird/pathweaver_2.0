/**
 * PageHeader - Inline title row with avatar menu button on the right.
 * Used at the top of every mobile page. Hidden on desktop (sidebar handles nav).
 */

import React, { useState } from 'react';
import { View, Pressable, Platform, useWindowDimensions, Modal } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { useUnreadCount } from '@/src/hooks/useNotifications';
import { VStack, UIText, Heading } from '../ui';

const DESKTOP_BREAKPOINT = 768;

interface MenuItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  onPress: () => void;
}

function AvatarMenu() {
  const { user, logout } = useAuthStore();
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  const isParent = user?.role === 'parent' || user?.role === 'superadmin' ||
    user?.org_role === 'parent' ||
    (user as any)?.has_dependents || (user as any)?.has_linked_students;

  const menuItems: MenuItem[] = [
    {
      key: 'profile',
      label: 'Profile',
      icon: 'person-outline',
      onPress: () => { setMenuOpen(false); router.push('/(app)/(tabs)/profile' as any); },
    },
    ...(isParent ? [{
      key: 'family',
      label: 'Family Dashboard',
      icon: 'people-outline' as keyof typeof Ionicons.glyphMap,
      onPress: () => { setMenuOpen(false); router.push('/(app)/(tabs)/family' as any); },
    }] : []),
    {
      key: 'logout',
      label: 'Sign Out',
      icon: 'log-out-outline',
      color: '#EF4444',
      onPress: () => { setMenuOpen(false); logout(); },
    },
  ];

  return (
    <>
      <Pressable
        onPress={() => setMenuOpen(true)}
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: menuOpen ? '#6D469B15' : '#F3F4F6',
        }}
      >
        <Ionicons name="person-circle-outline" size={28} color={menuOpen ? '#6D469B' : '#6B7280'} />
      </Pressable>

      <Modal
        visible={menuOpen}
        transparent
        animationType="none"
        onRequestClose={() => setMenuOpen(false)}
      >
        <Pressable style={{ flex: 1 }} onPress={() => setMenuOpen(false)}>
          <View
            style={{
              position: 'absolute',
              top: Platform.OS === 'web' ? 52 : insets.top + 44,
              right: 16,
              backgroundColor: '#fff',
              borderRadius: 14,
              paddingVertical: 6,
              minWidth: 200,
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.15)',
              elevation: 10,
              borderWidth: 1,
              borderColor: '#E5E7EB',
            }}
          >
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>
                {user?.display_name || `${user?.first_name} ${user?.last_name}`}
              </UIText>
              <UIText size="xs" className="text-typo-400" numberOfLines={1}>
                {user?.email}
              </UIText>
            </View>
            {menuItems.map((item) => (
              <Pressable
                key={item.key}
                onPress={item.onPress}
                style={{ paddingHorizontal: 16, paddingVertical: 12 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={item.icon} size={18} color={item.color || '#6B7280'} />
                  <UIText size="sm" style={{ color: item.color || '#1F2937' }} className="font-poppins-medium">
                    {item.label}
                  </UIText>
                </View>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

interface PageHeaderProps {
  title: string;
}

function NotificationBell() {
  const { user } = useAuthStore();
  const { unreadCount } = useUnreadCount(user?.id);

  return (
    <Pressable
      onPress={() => router.push('/(app)/notifications' as any)}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="notifications-outline" size={22} color="#6B7280" />
      {unreadCount > 0 && (
        <View style={{
          position: 'absolute', top: 2, right: 2,
          minWidth: 16, height: 16, borderRadius: 8,
          backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
        }}>
          <UIText style={{ color: '#fff', fontSize: 10, fontWeight: '700', lineHeight: 12 }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </UIText>
        </View>
      )}
    </Pressable>
  );
}

export function PageHeader({ title }: PageHeaderProps) {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  // Desktop doesn't need this -- sidebar handles navigation
  if (isDesktop) return null;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
      <Heading size="2xl">{title}</Heading>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <NotificationBell />
        <AvatarMenu />
      </View>
    </View>
  );
}
