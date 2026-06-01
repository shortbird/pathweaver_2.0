/**
 * PageHeader - Inline title row with avatar menu button on the right.
 * Used at the top of every mobile page. Hidden on desktop (sidebar handles nav).
 */

import React, { useEffect, useState } from 'react';
import { View, Pressable, Platform, Modal, ActivityIndicator, Image, Alert } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore, type PreviewRole } from '@/src/stores/previewRoleStore';
import { useActingAsStore } from '@/src/stores/actingAsStore';
import { api } from '@/src/services/api';

interface DemoAccount {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  role?: string;
  avatar_url?: string | null;
}

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
import { VStack, UIText, Heading } from '../ui';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';

interface MenuItem {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color?: string;
  onPress: () => void;
}

function AvatarMenu() {
  const { user, logout } = useAuthStore();
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  const setPreviewRole = usePreviewRoleStore((s) => s.setPreviewRole);
  const insets = useSafeAreaInsets();
  const [menuOpen, setMenuOpen] = useState(false);

  const isSuperadmin = user?.role === 'superadmin';
  const isParent = user?.role === 'parent' || user?.role === 'superadmin' ||
    user?.org_role === 'parent' ||
    (user as any)?.has_dependents || (user as any)?.has_linked_students;

  const startMasquerade = useActingAsStore((s) => s.startMasquerade);
  const stopMasquerade = useActingAsStore((s) => s.stopMasquerade);
  const restoreActingAs = useActingAsStore((s) => s.restore);
  const actingMode = useActingAsStore((s) => s.mode);
  const actingActive = useActingAsStore((s) => s.isActive);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[] | null>(null);
  const [demoLoading, setDemoLoading] = useState(false);

  // When the menu opens, recheck masquerade state. Native zustand stores
  // reset on Metro reload / app restart, so this is the cheapest place to
  // re-hydrate from the masquerade-status endpoint if state was lost.
  useEffect(() => {
    if (menuOpen) {
      Promise.resolve(restoreActingAs()).catch(() => { /* no-op */ });
    }
  }, [menuOpen, restoreActingAs]);

  // Fetch demo accounts when the picker becomes relevant (superadmin + menu open).
  useEffect(() => {
    if (!isSuperadmin || !menuOpen) return;
    if (demoAccounts !== null) return;
    let cancelled = false;
    setDemoLoading(true);
    api.get('/api/admin/masquerade/demo-accounts')
      .then(({ data }) => {
        if (!cancelled) setDemoAccounts(data.accounts || []);
      })
      .catch(() => {
        if (!cancelled) setDemoAccounts([]);
      })
      .finally(() => {
        if (!cancelled) setDemoLoading(false);
      });
    return () => { cancelled = true; };
  }, [isSuperadmin, menuOpen, demoAccounts]);

  const handlePickDemo = async (accountId: string) => {
    setMenuOpen(false);
    try {
      await startMasquerade(accountId);
    } catch (err) {
      console.warn('Failed to view as demo account', err);
    }
  };

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
      key: 'family',
      label: 'Family Dashboard',
      icon: 'people-outline' as keyof typeof Ionicons.glyphMap,
      onPress: () => { setMenuOpen(false); router.push('/(app)/(tabs)/family' as any); },
    }, {
      key: 'add-child',
      label: 'Add a child',
      icon: 'person-add-outline' as keyof typeof Ionicons.glyphMap,
      onPress: () => {
        setMenuOpen(false);
        Alert.alert(
          'Add a child',
          'Adding a new dependent or connecting to an existing student is currently available on the web app. Visit your Family Settings on web to add a child.',
        );
      },
    }] : []),
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
        <Ionicons name="ellipsis-vertical" size={20} color={menuOpen ? '#6D469B' : '#6B6280'} />
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
              borderColor: '#E2DCE8',
            }}
          >
            <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F1EDF5' }}>
              <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>
                {user?.display_name || `${user?.first_name} ${user?.last_name}`}
              </UIText>
              <UIText size="xs" className="text-typo-400" numberOfLines={1}>
                {user?.email}
              </UIText>
            </View>
            {/* Items above the logout (profile, family dashboard) */}
            {menuItems.slice(0, -1).map((item) => (
              <Pressable
                key={item.key}
                onPress={item.onPress}
                style={{ paddingHorizontal: 16, paddingVertical: 12 }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name={item.icon} size={18} color={item.color || '#6B6280'} />
                  <UIText size="sm" style={{ color: item.color || '#1F2937' }} className="font-poppins-medium">
                    {item.label}
                  </UIText>
                </View>
              </Pressable>
            ))}

            {/* Superadmin role preview controls */}
            {isSuperadmin && (
              <>
                <View style={{ borderTopWidth: 1, borderTopColor: '#F1EDF5', marginTop: 4, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
                  <UIText size="xs" style={{ color: '#9CA3AF', fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase' }}>
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
                        <Ionicons name={opt.icon} size={18} color={active ? '#6D469B' : '#6B6280'} />
                        <UIText size="sm" style={{ color: active ? '#6D469B' : '#1F2937', fontFamily: active ? 'Poppins_600SemiBold' : 'Poppins_500Medium' }}>
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
                      <Ionicons name="close-circle-outline" size={18} color="#6B6280" />
                      <UIText size="sm" style={{ color: '#1F2937' }} className="font-poppins-medium">
                        Exit preview
                      </UIText>
                    </View>
                  </Pressable>
                )}

                {/* Demo-account picker. Superadmin always sees this; tapping
                    a row masquerades as that account. Once masqueraded the
                    user is no longer superadmin so this whole section hides
                    automatically (clean for screenshots). */}
                <View style={{ borderTopWidth: 1, borderTopColor: '#F1EDF5', marginTop: 4, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
                  <UIText size="xs" style={{ color: '#9CA3AF', fontFamily: 'Poppins_600SemiBold', letterSpacing: 0.5, textTransform: 'uppercase' }}>
                    Demo accounts
                  </UIText>
                </View>
                {demoLoading && (
                      <View style={{ paddingHorizontal: 16, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <ActivityIndicator size="small" color="#6D469B" />
                        <UIText size="sm" style={{ color: '#6B6280' }}>Loading…</UIText>
                      </View>
                    )}
                    {!demoLoading && demoAccounts && demoAccounts.length === 0 && (
                      <View style={{ paddingHorizontal: 16, paddingVertical: 10 }}>
                        <UIText size="xs" style={{ color: '#9CA3AF' }}>
                          No demo accounts found. Run scripts/seed_demo_family.py.
                        </UIText>
                      </View>
                    )}
                    {!demoLoading && demoAccounts && demoAccounts.map((acct) => {
                      const name = acct.display_name
                        || `${acct.first_name || ''} ${acct.last_name || ''}`.trim()
                        || acct.email;
                      const subtitle = acct.role === 'parent' ? 'Parent'
                        : acct.role === 'observer' ? 'Observer'
                        : acct.role === 'student' ? 'Student'
                        : acct.role || '';
                      return (
                        <Pressable
                          key={acct.id}
                          onPress={() => handlePickDemo(acct.id)}
                          style={{ paddingHorizontal: 16, paddingVertical: 10 }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            {acct.avatar_url ? (
                              <Image
                                source={{ uri: acct.avatar_url }}
                                style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#F1EDF5' }}
                              />
                            ) : (
                              <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: '#F1EDF5', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="person" size={14} color="#9A93A8" />
                              </View>
                            )}
                            <View style={{ flex: 1 }}>
                              <UIText size="sm" style={{ color: '#1F2937' }} className="font-poppins-medium" numberOfLines={1}>
                                {name}
                              </UIText>
                              {subtitle ? (
                                <UIText size="xs" style={{ color: '#9CA3AF' }} numberOfLines={1}>
                                  {subtitle}
                                </UIText>
                              ) : null}
                            </View>
                            <Ionicons name="chevron-forward" size={14} color="#9CA3AF" />
                          </View>
                        </Pressable>
                      );
                    })}

                <View style={{ borderTopWidth: 1, borderTopColor: '#F1EDF5', marginTop: 4 }} />
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
                style={{ paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: '#F1EDF5' }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Ionicons name="arrow-back" size={18} color="#6D469B" />
                  <UIText size="sm" style={{ color: '#6D469B' }} className="font-poppins-semibold">
                    Exit demo view
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
                  <Ionicons name={item.icon} size={18} color={item.color || '#6B6280'} />
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
  const { isDesktop } = useBreakpoint();

  // Desktop doesn't need this -- sidebar handles navigation
  if (isDesktop) return null;

  return (
    <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <Heading size="2xl">{title}</Heading>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <PreviewRolePill />
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
