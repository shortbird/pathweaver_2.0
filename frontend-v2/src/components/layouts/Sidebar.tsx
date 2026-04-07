/**
 * Desktop Sidebar - Only renders on web at md+ breakpoints.
 * Mobile uses bottom tabs instead.
 */

import React, { useEffect, useState } from 'react';
import { View, Pressable, Image } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { UIText } from '../ui/text';
import { Divider } from '../ui/divider';
import { useAuthStore } from '@/src/stores/authStore';
import { useUnreadCount } from '@/src/hooks/useNotifications';
import { desktopNavItems, navItems } from '@/src/config/navigation';
import type { NavItem } from '@/src/config/navigation';
import api from '@/src/services/api';

const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png';

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const routePath = item.href.replace('/(app)/(tabs)', '');
  const isActive = pathname === routePath || pathname.startsWith(routePath + '/');
  const isAdminOnly = !!item.roles;

  return (
    <Pressable
      onPress={() => router.push(item.href as any)}
      className={`flex-row items-center gap-3 px-4 py-3 rounded-xl mx-2 ${
        isActive ? 'bg-optio-purple/10' : 'active:bg-surface-100 dark:active:bg-dark-surface-200'
      }`}
    >
      <Ionicons
        name={isActive ? item.iconActive : item.icon}
        size={22}
        color={isActive ? '#6D469B' : '#6B6280'}
      />
      <UIText
        size="sm"
        className={`flex-1 ${isActive ? 'text-optio-purple font-poppins-semibold' : 'text-typo-500'}`}
      >
        {item.label}
      </UIText>
      {isAdminOnly && (
        <Ionicons name="shield-checkmark-outline" size={14} color="#9A93A8" />
      )}
    </Pressable>
  );
}

function SidebarNotificationLink() {
  const { user } = useAuthStore();
  const { unreadCount } = useUnreadCount(user?.id);
  const pathname = usePathname();
  const isActive = pathname === '/notifications';

  return (
    <Pressable
      onPress={() => router.push('/(app)/notifications' as any)}
      className={`flex-row items-center gap-2 py-2 active:opacity-70 ${isActive ? 'opacity-100' : ''}`}
    >
      <View style={{ width: 20, height: 20, alignItems: 'center', justifyContent: 'center' }}>
        <Ionicons
          name={isActive ? 'notifications' : 'notifications-outline'}
          size={18}
          color={isActive ? '#6D469B' : '#6B6280'}
        />
        {unreadCount > 0 && (
          <View style={{
            position: 'absolute', top: -4, right: -6,
            minWidth: 14, height: 14, borderRadius: 7,
            backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
            paddingHorizontal: 2,
          }}>
            <UIText style={{ color: '#fff', fontSize: 9, fontWeight: '700', lineHeight: 11 }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </UIText>
          </View>
        )}
      </View>
      <UIText size="sm" className={isActive ? 'text-optio-purple font-poppins-semibold' : 'text-typo-500'}>
        Notifications
      </UIText>
    </Pressable>
  );
}

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const [hasCourses, setHasCourses] = useState(false);

  useEffect(() => {
    if (!user) return;
    const effectiveRole = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
    // Superadmin/org_admin/advisor always see courses
    if (['superadmin', 'org_admin', 'advisor'].includes(effectiveRole)) {
      setHasCourses(true);
      return;
    }
    // Others: check if they have enrolled courses
    (async () => {
      try {
        const { data } = await api.get('/api/users/dashboard');
        const enrolled = data?.enrolled_courses || [];
        setHasCourses(enrolled.length > 0);
      } catch {
        setHasCourses(false);
      }
    })();
  }, [user]);

  return (
    <View className="w-60 bg-white dark:bg-dark-surface-50 border-r border-surface-200 dark:border-dark-surface-300 pt-6 pb-4 flex flex-col h-full">
      {/* Logo */}
      <View className="px-5 mb-6">
        <Image
          source={{ uri: LOGO_URI }}
          style={{ width: 130, height: 40 }}
          resizeMode="contain"
        />
      </View>

      {/* Nav items */}
      <View className="flex-1 gap-1">
        {desktopNavItems.filter((item) => {
          // Courses: only if user has enrolled/created courses
          if (item.key === 'courses' && !hasCourses) return false;
          // Role-gated items
          if (!item.roles) return true;
          if (!user) return false;
          const effectiveRole = user.org_role && user.role === 'org_managed' ? user.org_role : user.role;
          return item.roles.includes(effectiveRole) || effectiveRole === 'superadmin';
        }).map((item) => (
          <NavLink key={item.key} item={item} />
        ))}

        {/* Family link for parents/superadmin */}
        {(user?.role === 'parent' || user?.role === 'superadmin' ||
          user?.org_role === 'parent' ||
          (user as any)?.has_dependents || (user as any)?.has_linked_students) && (
          <NavLink item={navItems.find((n) => n.key === 'family')!} />
        )}
      </View>

      <Divider className="mx-4 mb-3" />

      {/* User info + logout */}
      <View className="px-4 gap-2">
        <SidebarNotificationLink />
        <Pressable
          onPress={() => router.push('/(app)/(tabs)/profile' as any)}
          className="flex-row items-center gap-2 py-1 active:opacity-70"
        >
          <Ionicons name="person-circle-outline" size={20} color="#6B7280" />
          <UIText size="sm" className="text-typo-500 font-poppins-medium flex-1" numberOfLines={1}>
            {user?.display_name || user?.email}
          </UIText>
        </Pressable>
        <Pressable
          onPress={logout}
          className="flex-row items-center gap-2 py-2 active:opacity-70"
        >
          <Ionicons name="log-out-outline" size={18} color="#9A93A8" />
          <UIText size="sm" className="text-typo-400">Sign Out</UIText>
        </Pressable>
      </View>
    </View>
  );
}
