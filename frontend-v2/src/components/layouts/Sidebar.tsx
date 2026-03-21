/**
 * Desktop Sidebar - Only renders on web at md+ breakpoints.
 * Mobile uses bottom tabs instead.
 */

import React from 'react';
import { View, Pressable, Image } from 'react-native';
import { usePathname, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { UIText } from '../ui/text';
import { Divider } from '../ui/divider';
import { useAuthStore } from '@/src/stores/authStore';
import { desktopNavItems, navItems } from '@/src/config/navigation';
import type { NavItem } from '@/src/config/navigation';

const LOGO_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/logo_95c9e6ea25f847a2a8e538d96ee9a827.png';

function NavLink({ item }: { item: NavItem }) {
  const pathname = usePathname();
  const routePath = item.href.replace('/(app)/(tabs)', '');
  const isActive = pathname === routePath || pathname.startsWith(routePath + '/');

  return (
    <Pressable
      onPress={() => router.push(item.href as any)}
      className={`flex-row items-center gap-3 px-4 py-3 rounded-xl mx-2 ${
        isActive ? 'bg-optio-purple/10' : 'active:bg-surface-100'
      }`}
    >
      <Ionicons
        name={isActive ? item.iconActive : item.icon}
        size={22}
        color={isActive ? '#6D469B' : '#6B7280'}
      />
      <UIText
        size="sm"
        className={isActive ? 'text-optio-purple font-poppins-semibold' : 'text-typo-500'}
      >
        {item.label}
      </UIText>
    </Pressable>
  );
}

export function Sidebar() {
  const { user, logout } = useAuthStore();

  return (
    <View className="w-60 bg-white border-r border-surface-200 pt-6 pb-4 flex flex-col h-full">
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
        {desktopNavItems.map((item) => (
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
          <Ionicons name="log-out-outline" size={18} color="#9CA3AF" />
          <UIText size="sm" className="text-typo-400">Sign Out</UIText>
        </Pressable>
      </View>
    </View>
  );
}
