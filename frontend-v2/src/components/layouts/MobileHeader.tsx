/**
 * PageHeader - Inline title row with avatar menu button on the right.
 * Used at the top of every mobile page. Hidden on desktop (sidebar handles nav).
 */

import React, { useEffect, useState } from 'react';
import { View, Pressable, Platform, Modal } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore, type PreviewRole } from '@/src/stores/previewRoleStore';
import { useActingAsStore } from '@/src/stores/actingAsStore';
import { useAddKidStore } from '@/src/stores/addKidStore';

const PREVIEW_ROLE_LABEL: Record<string, string> = {
  parent: 'Parent',
  student: 'Student',
  observer: 'Observer',
};

function PreviewRolePill() {
  const user = useAuthStore((s) => s.user);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  const setPreviewRole = usePreviewRoleStore((s) => s.setPreviewRole);

  // Only superadmin sees the pill — and when masquerading the user.role is
  // the target's role, so it hides automatically without needing a flag.
  if (user?.role !== 'superadmin' || !previewRole) return null;

  return (
    <Pressable
      onPress={() => setPreviewRole(null)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 999,
        backgroundColor: '#6D469B',
      }}
    >
      <Ionicons name="eye-outline" size={12} color="#FFFFFF" />
      <UIText size="xs" style={{ color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold' }}>
        {PREVIEW_ROLE_LABEL[previewRole] || previewRole}
      </UIText>
      <Ionicons name="close" size={12} color="#FFFFFF" />
    </Pressable>
  );
}
import { useUnreadCount } from '@/src/hooks/useNotifications';
import { useUnreadCount as useUnreadMessages } from '@/src/hooks/useMessages';
import { useIsObserver } from '@/src/hooks/useStartSomething';
import { useSchool } from '@/src/hooks/useSchool';
import { VStack, UIText, Heading } from '../ui';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { useThemeColors } from '@/src/hooks/useThemeColors';

interface MenuItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  onPress: () => void;
}

function AvatarMenu() {
  const c = useThemeColors();
  const { user, logout } = useAuthStore();
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  const setPreviewRole = usePreviewRoleStore((s) => s.setPreviewRole);
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  const isSuperadmin = user?.role === 'superadmin';
  const isParent = user?.role === 'parent' || user?.role === 'superadmin' ||
    user?.org_role === 'parent' ||
    (user as any)?.has_dependents || (user as any)?.has_linked_students;

  const stopMasquerade = useActingAsStore((s) => s.stopMasquerade);
  const restoreActingAs = useActingAsStore((s) => s.restore);
  const actingMode = useActingAsStore((s) => s.mode);
  const actingActive = useActingAsStore((s) => s.isActive);

  // When the menu opens, recheck masquerade state. Native zustand stores
  // reset on Metro reload / app restart, so this is the cheapest place to
  // re-hydrate from the masquerade-status endpoint if state was lost.
  useEffect(() => {
    if (menuOpen) {
      Promise.resolve(restoreActingAs()).catch(() => { /* no-op */ });
    }
  }, [menuOpen, restoreActingAs]);

  const handlePreviewSelect = (role: PreviewRole | null) => {
    setMenuOpen(false);
    setPreviewRole(role);
    // Navigate to the sensible Home for each shell.
    const target =
      role === 'parent' ? '/(app)/(tabs)/family'
      : role === 'observer' ? '/(app)/(tabs)/feed' // observers don't have a Home tab
      : role === 'student' ? '/(app)/(tabs)/dashboard'
      : isParent ? '/(app)/(tabs)/family' // null → fall back to user's real shell
      : '/(app)/(tabs)/dashboard';
    router.replace(target as any);
  };

  const menuItems: MenuItem[] = [
    ...(isParent ? [{
      key: 'add-child',
      label: 'Add a child',
      icon: 'person-add-outline' as keyof typeof Ionicons.glyphMap,
      onPress: () => { setMenuOpen(false); useAddKidStore.getState().open(); },
    }] : []),
    {
      key: 'settings',
      label: 'Settings',
      icon: 'settings-outline',
      onPress: () => { setMenuOpen(false); router.push('/(app)/settings' as any); },
    },
    {
      key: 'logout',
      label: 'Sign Out',
      icon: 'log-out-outline',
      color: '#EF4444',
      onPress: () => { setMenuOpen(false); logout(); },
    },
  ];

  const previewOptions: { role: PreviewRole; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { role: 'parent', label: 'Preview as Parent', icon: 'people-outline' },
    { role: 'student', label: 'Preview as Student', icon: 'school-outline' },
    { role: 'observer', label: 'Preview as Observer', icon: 'eye-outline' },
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
          backgroundColor: menuOpen ? '#6D469B15' : 'transparent',
        }}
      >
        <Ionicons name="ellipsis-vertical" size={20} color={menuOpen ? '#6D469B' : c.icon} />
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
              backgroundColor: c.card,
              borderRadius: 14,
              paddingVertical: 6,
              minWidth: 200,
              boxShadow: '0 8px 20px rgba(0, 0, 0, 0.15)',
              elevation: 10,
              borderWidth: 1,
              borderColor: c.border,
            }}
          >
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: c.surfaceMuted }}>
              <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>
                {user?.display_name || `${user?.first_name} ${user?.last_name}`}
              </UIText>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>
                {user?.email}
              </UIText>
            </View>
            {/* Items above the logout (e.g. add a child, settings) */}
            {menuItems.slice(0, -1).map((item) => (
              <Pressable
                key={item.key}
                onPress={item.onPress}
                style={{ paddingHorizontal: 16, paddingVertical: 12 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={item.icon} size={18} color={item.color || c.icon} />
                  <UIText size="sm" style={{ color: item.color || c.text }} className="font-poppins-medium">
                    {item.label}
                  </UIText>
                </View>
              </Pressable>
            ))}

            {/* Superadmin role preview controls */}
            {isSuperadmin && (
              <>
                {/* Admin console — superadmin only. The admin tab is web-only in
                    the tab bar; this is the native entry point to the same
                    screen (users list, masquerade, user details). */}
                <Pressable
                  onPress={() => { setMenuOpen(false); router.push('/(app)/(tabs)/admin' as any); }}
                  style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.surfaceMuted, marginTop: 4 }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Ionicons name="shield-checkmark-outline" size={18} color={c.icon} />
                    <UIText size="sm" style={{ color: c.text }} className="font-poppins-medium">
                      Admin
                    </UIText>
                  </View>
                </Pressable>
                <View style={{ borderTopWidth: 1, borderTopColor: c.surfaceMuted, marginTop: 4, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
                  <UIText size="xs" style={{ color: c.textFaint, fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Preview as
                  </UIText>
                </View>
                {previewOptions.map((opt) => {
                  const active = previewRole === opt.role;
                  return (
                    <Pressable
                      key={`preview-${opt.role}`}
                      onPress={() => handlePreviewSelect(opt.role)}
                      style={{ paddingHorizontal: 16, paddingVertical: 10, backgroundColor: active ? '#6D469B0F' : 'transparent' }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name={opt.icon} size={18} color={active ? '#6D469B' : c.icon} />
                        <UIText size="sm" style={{ color: active ? '#6D469B' : c.text, fontFamily: active ? 'Poppins_600SemiBold' : 'Poppins_500Medium' }}>
                          {opt.label}
                        </UIText>
                        {active && (
                          <Ionicons name="checkmark" size={16} color="#6D469B" style={{ marginLeft: 'auto' }} />
                        )}
                      </View>
                    </Pressable>
                  );
                })}
                {previewRole && (
                  <Pressable
                    onPress={() => handlePreviewSelect(null)}
                    style={{ paddingHorizontal: 16, paddingVertical: 10 }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Ionicons name="close-circle-outline" size={18} color={c.icon} />
                      <UIText size="sm" style={{ color: c.text }} className="font-poppins-medium">
                        Exit preview
                      </UIText>
                    </View>
                  </Pressable>
                )}

                <View style={{ borderTopWidth: 1, borderTopColor: c.surfaceMuted, marginTop: 4 }} />
              </>
            )}

            {/* Sole exit path while masquerading — the acting-as banner is
                hidden in this mode (it would clutter screenshots), and once
                the user is viewing as the demo account they're no longer
                superadmin, so the demo toggle is gone too. */}
            {actingActive && actingMode === 'masquerade' && (
              <Pressable
                onPress={async () => {
                  setMenuOpen(false);
                  try { await stopMasquerade(); } catch { /* no-op */ }
                }}
                style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: c.surfaceMuted }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="arrow-back" size={18} color="#6D469B" />
                  <UIText size="sm" style={{ color: '#6D469B' }} className="font-poppins-semibold">
                    End Masquerade
                  </UIText>
                </View>
              </Pressable>
            )}

            {/* Logout */}
            {menuItems.slice(-1).map((item) => (
              <Pressable
                key={item.key}
                onPress={item.onPress}
                style={{ paddingHorizontal: 16, paddingVertical: 12 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={item.icon} size={18} color={item.color || c.icon} />
                  <UIText size="sm" style={{ color: item.color || c.text }} className="font-poppins-medium">
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
  const c = useThemeColors();
  const { user } = useAuthStore();
  const { unreadCount } = useUnreadCount(user?.id);

  return (
    <Pressable
      onPress={() => router.push('/(app)/notifications' as any)}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
    >
      <Ionicons name="notifications-outline" size={22} color={c.icon} />
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

// Messages moved out of the student tab bar (it's notification-driven, not a
// browse destination) into this header icon, sitting next to the bell. The
// unread badge moved with it. Only rendered in the student shell — parents keep
// Messages as a tab, and observers have no messaging surface (see PageHeader).
function MessagesButton() {
  const c = useThemeColors();
  const { count } = useUnreadMessages();

  return (
    <Pressable
      onPress={() => router.push('/(app)/(tabs)/messages' as any)}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `Messages, ${count} unread` : 'Messages'}
    >
      <Ionicons name="chatbubbles-outline" size={22} color={c.icon} />
      {count > 0 && (
        <View style={{
          position: 'absolute', top: 2, right: 2,
          minWidth: 16, height: 16, borderRadius: 8,
          backgroundColor: '#EF4444', alignItems: 'center', justifyContent: 'center',
          paddingHorizontal: 3,
        }}>
          <UIText style={{ color: '#fff', fontSize: 10, fontWeight: '700', lineHeight: 12 }}>
            {count > 99 ? '99+' : count}
          </UIText>
        </View>
      )}
    </Pressable>
  );
}

// The user's school, one tap from anywhere — announcements, events, the
// carpool board, absence reporting. Rendered only for members of a SIS school
// (/me attaches user.school; useSchool also excludes observers). Sits left of
// the bell like MessagesButton: the School page is notification-driven too
// (school pushes deep-link into it).
function SchoolButton() {
  const c = useThemeColors();
  const school = useSchool();
  if (!school) return null;

  return (
    <Pressable
      onPress={() => router.push('/(app)/school' as any)}
      style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center' }}
      accessibilityRole="button"
      accessibilityLabel={school.name || 'Community'}
      testID="header-school-button"
    >
      <Ionicons name="business-outline" size={22} color={c.icon} />
    </Pressable>
  );
}

// Small badge shown next to the page title while an admin is masquerading as
// another user, so it's always obvious whose account you're viewing.
function MasqueradeBadge() {
  const isActive = useActingAsStore((s) => s.isActive);
  const mode = useActingAsStore((s) => s.mode);
  const target = useActingAsStore((s) => s.target);

  if (!isActive || mode !== 'masquerade') return null;

  const name = target?.first_name || target?.display_name || 'user';

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 999,
        backgroundColor: '#EF597B',
      }}
    >
      <Ionicons name="eye-outline" size={11} color="#FFFFFF" />
      <UIText size="xs" style={{ color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold' }}>
        as {name}
      </UIText>
    </View>
  );
}

export function PageHeader({ title }: PageHeaderProps) {
  const { isDesktop } = useBreakpoint();
  const isObserver = useIsObserver();
  // Messages lives in the header for everyone who has it, which since
  // 2026-08-18 means parents too — Journal took its slot in the parent tab bar
  // (see parentMobileTabOrder). Observers have no messaging surface at all.
  // Mirrors which shell (tabs)/_layout.tsx renders, so the icon is present iff
  // Messages left the bar; the two must move together.
  const showMessages = !isObserver;

  // Desktop doesn't need this -- sidebar handles navigation
  if (isDesktop) return null;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
          {/* text-3xl ships a 36px line height, which is shorter than Poppins
              Bold's 30px glyph box — descenders (the g in "Messages") were
              shaved off the bottom. */}
          <Heading size="2xl" style={{ lineHeight: 40 }}>{title}</Heading>
          <MasqueradeBadge />
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PreviewRolePill />
          <SchoolButton />
          {showMessages && <MessagesButton />}
          <NotificationBell />
          <AvatarMenu />
        </View>
      </View>
      {/* Brand accent line */}
      <View
        style={{
          height: 3,
          borderRadius: 1.5,
          marginTop: 10,
          backgroundColor: '#6D469B',
          ...(Platform.OS === 'web'
            ? { backgroundImage: 'linear-gradient(90deg, #6D469B 0%, #EF597B 100%)' }
            : {}),
          width: 40,
        }}
      />
    </View>
  );
}
