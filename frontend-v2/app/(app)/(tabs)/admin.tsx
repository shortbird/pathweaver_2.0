/**
 * Admin Panel - Web only. Superadmin/org_admin access.
 *
 * Tabs: Users, Quests, Organizations, Courses, Flagged Tasks, Emails
 */

import React, { useState, useEffect } from 'react';
import api from '@/src/services/api';
import { View, ScrollView, Pressable, Platform, TextInput, Alert, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useAdminUsers, useAdminQuests, useAdminOrganizations, useOrgDetail, type AdminUser } from '@/src/hooks/useAdmin';
import { CreateQuestModal } from '@/src/components/admin/CreateQuestModal';
import { UserConnectionsTab } from '@/src/components/admin/UserConnectionsTab';
import { UserChatLogs } from '@/src/components/admin/UserChatLogs';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Divider, Skeleton, Input, InputField, InputSlot, InputIcon,
  Avatar, AvatarFallbackText, AvatarImage, toast,
} from '@/src/components/ui';

type AdminTab = 'users' | 'quests' | 'orgs' | 'emails' | 'bulk' | 'docs';

const tabs: { key: AdminTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'quests', label: 'Quests', icon: 'rocket-outline' },
  { key: 'orgs', label: 'Organizations', icon: 'business-outline' },
  { key: 'emails', label: 'Emails', icon: 'mail-outline' },
  { key: 'bulk', label: 'Bulk Generate', icon: 'layers-outline' },
  { key: 'docs', label: 'Docs', icon: 'document-text-outline' },
];

// Only the Users tab is currently exposed in the admin panel. The other admin
// surfaces (Quests, Organizations, Emails, Bulk Generate, Docs) are hidden
// until they're polished for mobile/dark mode — add their keys back here to
// re-enable them.
const VISIBLE_TAB_KEYS: AdminTab[] = ['users'];

// ── Users Tab ──

// Role badge palettes as raw hex so we can drive both the pill background and
// the label color via inline styles. (UIText's base `dark:text-dark-typo` wins
// over a `text-green-700` className in dark mode, which made the label vanish
// on the light pill — inline color sidesteps that.)
const roleBadgePalette: Record<string, { light: [string, string]; dark: [string, string] }> = {
  // [background, text]
  superadmin: { light: ['#FEE2E2', '#B91C1C'], dark: ['#3F1D1D', '#FCA5A5'] },
  org_admin: { light: ['#F3E8FF', '#7E22CE'], dark: ['#2E2440', '#D8B4FE'] },
  advisor: { light: ['#DBEAFE', '#1D4ED8'], dark: ['#1E2A45', '#93C5FD'] },
  parent: { light: ['#FEF3C7', '#B45309'], dark: ['#3A2E15', '#FCD34D'] },
  student: { light: ['#DCFCE7', '#15803D'], dark: ['#163024', '#6EE7B7'] },
  observer: { light: ['#F3F4F6', '#374151'], dark: ['#2A2A42', '#D1D5DB'] },
  org_managed: { light: ['#E0E7FF', '#4338CA'], dark: ['#21243F', '#A5B4FC'] },
};

function RoleBadge({ role }: { role: string }) {
  const c = useThemeColors();
  const entry = roleBadgePalette[role] || roleBadgePalette.student;
  const [bg, text] = c.isDark ? entry.dark : entry.light;
  const label = role === 'org_managed' ? 'Org' : role === 'org_admin' ? 'Org Admin' : role;
  return (
    <View style={{ alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: bg }}>
      <UIText size="xs" className="font-poppins-medium capitalize" style={{ color: text }}>{label}</UIText>
    </View>
  );
}

function UserCardMobile({ user, onMasquerade, onDelete, onSelect }: { user: AdminUser; onMasquerade: () => void; onDelete: () => void; onSelect?: () => void }) {
  const c = useThemeColors();
  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase();
  const effectiveRole = user.role === 'org_managed' ? (user.org_role || 'org_managed') : user.role;
  const lastActive = user.last_active
    ? new Date(user.last_active).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Never';

  return (
    <Pressable onPress={onSelect}>
    <Card variant="elevated" size="sm">
      <HStack className="items-start gap-3">
        <Avatar size="md">
          {user.avatar_url ? (
            <AvatarImage source={{ uri: user.avatar_url }} />
          ) : (
            <AvatarFallbackText>{initials}</AvatarFallbackText>
          )}
        </Avatar>
        <VStack className="flex-1 min-w-0" space="xs">
          <HStack className="items-center justify-between">
            <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>
              {user.display_name || `${user.first_name} ${user.last_name}`}
            </UIText>
            <RoleBadge role={effectiveRole} />
          </HStack>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{user.email}</UIText>
          <HStack className="items-center justify-between">
            <HStack className="items-center gap-3">
              <HStack className="items-center gap-1">
                <Ionicons name="star" size={12} color="#FF9028" />
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{(user.total_xp || 0).toLocaleString()} XP</UIText>
              </HStack>
              <HStack className="items-center gap-1">
                <Ionicons name="time-outline" size={12} color={c.iconMuted} />
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{lastActive}</UIText>
              </HStack>
            </HStack>
            <HStack className="gap-1">
              <Pressable
                onPress={onMasquerade}
                className="w-8 h-8 rounded-lg bg-surface-100 items-center justify-center active:bg-surface-200 dark:bg-dark-surface-200"
              >
                <Ionicons name="eye-outline" size={16} color={c.icon} />
              </Pressable>
              <Pressable
                onPress={onDelete}
                className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950 items-center justify-center active:bg-red-100"
              >
                <Ionicons name="trash-outline" size={14} color="#EF4444" />
              </Pressable>
            </HStack>
          </HStack>
        </VStack>
      </HStack>
    </Card>
    </Pressable>
  );
}

function UserRowDesktop({ user, onSelect }: { user: AdminUser; onSelect: () => void }) {
  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase();
  const effectiveRole = user.role === 'org_managed' ? (user.org_role || 'org_managed') : user.role;
  const lastActive = user.last_active
    ? new Date(user.last_active).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : 'Never';

  return (
    <>
      <Pressable onPress={onSelect} className="active:bg-optio-purple/5">
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
          <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Avatar size="xs" className="flex-shrink-0">
              {user.avatar_url ? (
                <AvatarImage source={{ uri: user.avatar_url }} />
              ) : (
                <AvatarFallbackText>{initials}</AvatarFallbackText>
              )}
            </Avatar>
            <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
              {user.display_name || `${user.first_name} ${user.last_name}`}
            </UIText>
          </View>
          <View style={{ flex: 3 }}>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{user.email}</UIText>
          </View>
          <View style={{ flex: 1.5 }}>
            <RoleBadge role={effectiveRole} />
          </View>
          <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{lastActive}</UIText>
          </View>
        </View>
      </Pressable>
      <Divider />
    </>
  );
}

// ── User Detail Panel ──

const PROFILE_FIELDS: { key: string; label: string; placeholder?: string; keyboardType?: 'default' | 'email-address' | 'phone-pad' }[] = [
  { key: 'first_name', label: 'First name' },
  { key: 'last_name', label: 'Last name' },
  { key: 'email', label: 'Email', keyboardType: 'email-address' },
  { key: 'phone_number', label: 'Phone', keyboardType: 'phone-pad' },
  { key: 'date_of_birth', label: 'Date of birth', placeholder: 'YYYY-MM-DD' },
  { key: 'address_line1', label: 'Address line 1' },
  { key: 'address_line2', label: 'Address line 2' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State / Province' },
  { key: 'postal_code', label: 'Postal code' },
  { key: 'country', label: 'Country' },
];

function UserDetailPanel({ user, onClose, onMasquerade, onDelete, onResetPassword, onVerifyEmail, onUpdateRole, onUpdateProfile, getUserDetail }: {
  user: AdminUser;
  onClose: () => void;
  onMasquerade: () => void;
  onDelete: () => void;
  onResetPassword: () => Promise<void>;
  onVerifyEmail: () => void;
  onUpdateRole: (role: string, orgRole?: string) => void;
  onUpdateProfile: (updates: Record<string, any>) => Promise<void>;
  getUserDetail: (id: string) => Promise<any>;
}) {
  const c = useThemeColors();
  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase();
  const effectiveRole = user.role === 'org_managed' ? (user.org_role || 'org_managed') : user.role;
  const [detailTab, setDetailTab] = useState<'profile' | 'role' | 'connections' | 'chats' | 'actions'>('profile');
  const [resettingPassword, setResettingPassword] = useState(false);
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  // Editable profile state. Loaded from the detail endpoint (the list row lacks
  // phone/address/dob); we diff against the loaded snapshot so a Save only sends
  // fields the admin actually changed.
  const [form, setForm] = useState<Record<string, string>>({});
  const [initialForm, setInitialForm] = useState<Record<string, string>>({});
  const [profileLoading, setProfileLoading] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);

  useEffect(() => {
    let active = true;
    setProfileLoading(true);
    getUserDetail(user.id)
      .then((detail) => {
        if (!active) return;
        const next: Record<string, string> = {};
        for (const { key } of PROFILE_FIELDS) next[key] = detail?.[key] != null ? String(detail[key]) : '';
        setForm(next);
        setInitialForm(next);
      })
      .catch(() => { if (active) toast.error('Could not load full profile'); })
      .finally(() => { if (active) setProfileLoading(false); });
    return () => { active = false; };
  }, [user.id, getUserDetail]);

  const handleSaveProfile = async () => {
    const changed: Record<string, any> = {};
    for (const { key } of PROFILE_FIELDS) {
      if (form[key] !== initialForm[key]) changed[key] = form[key].trim() === '' ? null : form[key].trim();
    }
    if (Object.keys(changed).length === 0) { toast.info('No changes to save'); return; }
    setSavingProfile(true);
    try {
      await onUpdateProfile(changed);
      setInitialForm({ ...form });
      toast.success('Profile updated');
    } catch (e: any) {
      toast.error(e?.response?.data?.error || 'Failed to update profile');
    } finally {
      setSavingProfile(false);
    }
  };

  const dirty = PROFILE_FIELDS.some(({ key }) => form[key] !== initialForm[key]);

  const detailTabs = [
    { key: 'profile' as const, label: 'Profile' },
    { key: 'role' as const, label: 'Role' },
    { key: 'connections' as const, label: 'Connect' },
    { key: 'chats' as const, label: 'Chats' },
    { key: 'actions' as const, label: 'Actions' },
  ];

  return (
    <Card variant="elevated" size="md">
      <VStack space="md">
        {/* Header */}
        <HStack className="items-center justify-between">
          <HStack className="items-center gap-3">
            <Avatar size="lg">
              {user.avatar_url ? (
                <AvatarImage source={{ uri: user.avatar_url }} />
              ) : (
                <AvatarFallbackText>{initials}</AvatarFallbackText>
              )}
            </Avatar>
            <VStack>
              <Heading size="md">{user.display_name || `${user.first_name} ${user.last_name}`}</Heading>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{user.email}</UIText>
              {memberSince && <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">Member since {memberSince}</UIText>}
            </VStack>
          </HStack>
          <Pressable onPress={onClose} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center dark:bg-dark-surface-200">
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        {/* Sub-tabs */}
        <HStack className="bg-surface-100 rounded-lg p-1 dark:bg-dark-surface-200" space="xs">
          {detailTabs.map((t) => (
            <Pressable key={t.key} onPress={() => setDetailTab(t.key)} className={`flex-1 py-2 rounded-md items-center ${detailTab === t.key ? 'bg-white dark:bg-dark-surface-100' : ''}`}>
              <UIText size="xs" numberOfLines={1} className={detailTab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>{t.label}</UIText>
            </Pressable>
          ))}
        </HStack>

        {/* Profile tab - editable */}
        {detailTab === 'profile' && (
          profileLoading ? (
            <VStack space="sm">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</VStack>
          ) : (
            <VStack space="sm">
              {/* Read-only stats */}
              <HStack className="gap-3">
                <Card variant="filled" size="sm" className="flex-1 items-center py-2">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Total XP</UIText>
                  <UIText size="sm" className="font-poppins-semibold text-optio-purple">{(user.total_xp || 0).toLocaleString()}</UIText>
                </Card>
                <Card variant="filled" size="sm" className="flex-1 items-center py-2">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Role</UIText>
                  <RoleBadge role={effectiveRole} />
                </Card>
                <Card variant="filled" size="sm" className="flex-1 items-center py-2">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Dependent</UIText>
                  <UIText size="sm" className="font-poppins-medium">{user.is_dependent ? 'Yes' : 'No'}</UIText>
                </Card>
              </HStack>

              {/* Editable fields */}
              {PROFILE_FIELDS.map(({ key, label, placeholder, keyboardType }) => (
                <VStack key={key} space="xs">
                  <UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">{label}</UIText>
                  <Input size="sm">
                    <InputField
                      value={form[key] ?? ''}
                      onChangeText={(v: string) => setForm((prev) => ({ ...prev, [key]: v }))}
                      placeholder={placeholder}
                      keyboardType={keyboardType}
                      autoCapitalize={key === 'email' ? 'none' : 'sentences'}
                    />
                  </Input>
                </VStack>
              ))}

              <Button onPress={handleSaveProfile} loading={savingProfile} disabled={!dirty}>
                <ButtonText>Save Changes</ButtonText>
              </Button>
            </VStack>
          )
        )}

        {/* Connections tab */}
        {detailTab === 'connections' && <UserConnectionsTab user={user} />}

        {/* Chats tab */}
        {detailTab === 'chats' && <UserChatLogs user={user} />}

        {/* Role tab */}
        {detailTab === 'role' && (
          <VStack space="sm">
            <UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Change Role</UIText>
            <View className="flex flex-row flex-wrap gap-2">
              {['student', 'parent', 'advisor', 'observer', 'org_admin', 'superadmin'].map((r) => (
                <Pressable key={r} onPress={() => onUpdateRole(r)}>
                  <View className={`px-3 py-2 rounded-lg ${effectiveRole === r ? 'bg-optio-purple' : 'bg-surface-100 active:bg-surface-200 dark:bg-dark-surface-200'}`}>
                    <UIText size="xs" className={`font-poppins-medium capitalize ${effectiveRole === r ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>
                      {r === 'org_admin' ? 'Org Admin' : r}
                    </UIText>
                  </View>
                </Pressable>
              ))}
            </View>
          </VStack>
        )}

        {/* Actions tab */}
        {detailTab === 'actions' && (
          <VStack space="sm">
            <Pressable onPress={onMasquerade} className="flex-row items-center gap-3 px-4 py-3 bg-amber-50 dark:bg-amber-950 rounded-xl active:bg-amber-100">
              <Ionicons name="eye-outline" size={20} color="#B45309" />
              <VStack>
                <UIText size="sm" className="font-poppins-medium text-amber-700 dark:text-amber-300">Masquerade</UIText>
                <UIText size="xs" className="text-amber-600 dark:text-amber-400">View platform as this user</UIText>
              </VStack>
            </Pressable>

            <Pressable onPress={onVerifyEmail} className="flex-row items-center gap-3 px-4 py-3 bg-blue-50 dark:bg-blue-950 rounded-xl active:bg-blue-100">
              <Ionicons name="checkmark-circle-outline" size={20} color="#1D4ED8" />
              <VStack>
                <UIText size="sm" className="font-poppins-medium text-blue-700 dark:text-blue-300">Verify Email</UIText>
                <UIText size="xs" className="text-blue-600 dark:text-blue-400">Mark email as verified</UIText>
              </VStack>
            </Pressable>

            <Pressable
              disabled={resettingPassword}
              onPress={async () => {
                setResettingPassword(true);
                try {
                  await onResetPassword();
                  toast.success("Password reset to “changeme!”");
                } catch (e: any) {
                  toast.error(e?.response?.data?.error || 'Failed to reset password');
                } finally {
                  setResettingPassword(false);
                }
              }}
              className="flex-row items-center gap-3 px-4 py-3 bg-orange-50 dark:bg-orange-950 rounded-xl active:bg-orange-100"
            >
              <Ionicons name="key-outline" size={20} color="#C2410C" />
              <VStack>
                <UIText size="sm" className="font-poppins-medium text-orange-700 dark:text-orange-300">
                  {resettingPassword ? 'Resetting...' : 'Reset Password'}
                </UIText>
                <UIText size="xs" className="text-orange-600 dark:text-orange-400">Sets password to "changeme!"</UIText>
              </VStack>
            </Pressable>

            <Divider className="my-2" />

            <Pressable onPress={onDelete} className="flex-row items-center gap-3 px-4 py-3 bg-red-50 dark:bg-red-950 rounded-xl active:bg-red-100">
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
              <VStack>
                <UIText size="sm" className="font-poppins-medium text-red-700 dark:text-red-300">Delete User</UIText>
                <UIText size="xs" className="text-red-600 dark:text-red-400">Permanently remove this account</UIText>
              </VStack>
            </Pressable>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

// ── Users Panel ──

function UsersPanel() {
  const c = useThemeColors();
  const {
    users, total, loading, page, setPage, search, setSearch,
    roleFilter, setRoleFilter, perPage, totalPages,
    deleteUser, masquerade, updateUserRole, resetPassword, verifyEmail,
    updateUser, getUserDetail,
  } = useAdminUsers();
  const { isDesktop } = useBreakpoint();
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);

  const roles = ['student', 'parent', 'advisor', 'observer', 'org_admin', 'org_managed', 'superadmin'];

  const handleSelectUser = (user: AdminUser) => {
    setSelectedUser(selectedUser?.id === user.id ? null : user);
  };

  return (
    <VStack space="md">
      {/* Search */}
      <Input variant="rounded">
        <InputSlot className="ml-3"><InputIcon as="search-outline" /></InputSlot>
        <InputField placeholder="Search by name or email..." value={search} onChangeText={setSearch} />
      </Input>

      {/* Role filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <HStack space="xs">
          <Pressable onPress={() => { setRoleFilter(null); setPage(1); }}>
            <View className={`px-3 py-1.5 rounded-full ${!roleFilter ? 'bg-optio-purple' : 'bg-surface-200 dark:bg-dark-surface-300'}`}>
              <UIText size="xs" className={`font-poppins-medium ${!roleFilter ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>All ({total})</UIText>
            </View>
          </Pressable>
          {roles.map((r) => (
            <Pressable key={r} onPress={() => { setRoleFilter(r); setPage(1); }}>
              <View className={`px-3 py-1.5 rounded-full ${roleFilter === r ? 'bg-optio-purple' : 'bg-surface-200 dark:bg-dark-surface-300'}`}>
                <UIText size="xs" className={`font-poppins-medium capitalize ${roleFilter === r ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>
                  {r === 'org_managed' ? 'Org Managed' : r === 'org_admin' ? 'Org Admin' : r}
                </UIText>
              </View>
            </Pressable>
          ))}
        </HStack>
      </ScrollView>

      {/* User list */}
      {loading ? (
        <VStack space="sm">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</VStack>
      ) : users.length === 0 ? (
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="people-outline" size={40} color={c.iconMuted} />
          <Heading size="sm" className="text-typo-500 mt-3 dark:text-dark-typo-500">No users found</Heading>
          <UIText size="sm" className="text-typo-400 mt-1 dark:text-dark-typo-400">Try a different search or filter</UIText>
        </Card>
      ) : isDesktop ? (
        /* Desktop: table + detail panel side by side */
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: selectedUser ? 3 : 1 }}>
            <Card variant="elevated" size="sm" className="overflow-hidden">
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <View style={{ flex: 3 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">User</UIText></View>
                <View style={{ flex: 3 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Email</UIText></View>
                <View style={{ flex: 1.5 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Role</UIText></View>
                <View style={{ flex: 1.5, alignItems: 'flex-end' }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Last Active</UIText></View>
              </View>
              {users.map((u) => (
                <UserRowDesktop key={u.id} user={u} onSelect={() => handleSelectUser(u)} />
              ))}
            </Card>
          </View>

          {selectedUser && (
            <View style={{ flex: 2 }}>
              <UserDetailPanel
                user={selectedUser}
                onClose={() => setSelectedUser(null)}
                onMasquerade={() => masquerade(selectedUser.id)}
                onDelete={() => { if (confirm(`Delete ${selectedUser.email}?`)) { deleteUser(selectedUser.id); setSelectedUser(null); } }}
                onResetPassword={() => resetPassword(selectedUser.id)}
                onVerifyEmail={() => verifyEmail(selectedUser.id)}
                onUpdateRole={(role) => updateUserRole(selectedUser.id, role)}
                onUpdateProfile={(updates) => updateUser(selectedUser.id, updates)}
                getUserDetail={getUserDetail}
              />
            </View>
          )}
        </View>
      ) : (
        /* Mobile: card layout, tap opens detail below */
        <VStack space="sm">
          {users.map((u) => (
            <VStack key={u.id} space="sm">
              <UserCardMobile
                user={u}
                onSelect={() => handleSelectUser(u)}
                onMasquerade={() => masquerade(u.id)}
                onDelete={() => { if (confirm(`Delete ${u.email}?`)) deleteUser(u.id); }}
              />
              {selectedUser?.id === u.id && (
                <UserDetailPanel
                  user={u}
                  onClose={() => setSelectedUser(null)}
                  onMasquerade={() => masquerade(u.id)}
                  onDelete={() => { if (confirm(`Delete ${u.email}?`)) { deleteUser(u.id); setSelectedUser(null); } }}
                  onResetPassword={() => resetPassword(u.id)}
                  onVerifyEmail={() => verifyEmail(u.id)}
                  onUpdateRole={(role) => updateUserRole(u.id, role)}
                  onUpdateProfile={(updates) => updateUser(u.id, updates)}
                  getUserDetail={getUserDetail}
                />
              )}
            </VStack>
          ))}
        </VStack>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <HStack className="items-center justify-between">
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
            Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} of {total}
          </UIText>
          <HStack className="items-center gap-2">
            <Pressable
              onPress={() => setPage(page - 1)}
              disabled={page <= 1}
              className={`w-9 h-9 rounded-lg items-center justify-center ${page <= 1 ? 'opacity-30' : 'bg-surface-100 active:bg-surface-200 dark:bg-dark-surface-200'}`}
            >
              <Ionicons name="chevron-back" size={18} color={c.icon} />
            </Pressable>
            <UIText size="sm" className="text-typo-500 font-poppins-medium dark:text-dark-typo-500">{page} / {totalPages}</UIText>
            <Pressable
              onPress={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className={`w-9 h-9 rounded-lg items-center justify-center ${page >= totalPages ? 'opacity-30' : 'bg-surface-100 active:bg-surface-200 dark:bg-dark-surface-200'}`}
            >
              <Ionicons name="chevron-forward" size={18} color={c.icon} />
            </Pressable>
          </HStack>
        </HStack>
      )}
    </VStack>
  );
}

// ── Quests Tab ──

function QuestRowDesktop({ quest, onSelect, isSelected, orgName }: { quest: any; onSelect: () => void; isSelected: boolean; orgName?: string }) {
  const imageUrl = quest.header_image_url || quest.image_url;

  return (
    <>
      <Pressable onPress={onSelect} className={isSelected ? 'bg-optio-purple/5' : 'active:bg-optio-purple/5'}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
          <View style={{ flex: 0.5 }}>
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={{ width: 36, height: 36, borderRadius: 8 }} resizeMode="cover" />
            ) : (
              <View className="w-9 h-9 rounded-lg bg-optio-purple/10 items-center justify-center">
                <Ionicons name="rocket-outline" size={16} color="#6D469B" />
              </View>
            )}
          </View>
          <View style={{ flex: 3 }}>
            <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{quest.title}</UIText>
          </View>
          <View style={{ flex: 1.5 }}>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{quest.creator_name || '--'}</UIText>
          </View>
          <View style={{ flex: 1.5 }}>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{orgName || '--'}</UIText>
          </View>
          <View style={{ flex: 1 }}>
            <Badge action="muted"><BadgeText className="text-typo-500 capitalize dark:text-dark-typo-500">{quest.quest_type || 'optio'}</BadgeText></Badge>
          </View>
          <View style={{ flex: 1 }}>
            <Badge action={quest.is_active ? 'success' : 'error'}>
              <BadgeText className={quest.is_active ? 'text-green-700' : 'text-red-700'}>
                {quest.is_active ? 'Active' : 'Inactive'}
              </BadgeText>
            </Badge>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
              {quest.is_public ? 'Public' : 'Private'}
            </UIText>
          </View>
        </View>
      </Pressable>
      <Divider />
    </>
  );
}

function QuestCardMobile({ quest, onDelete, onSelect }: { quest: any; onDelete: () => void; onSelect?: () => void }) {
  const imageUrl = quest.header_image_url || quest.image_url;

  return (
    <Pressable onPress={onSelect || (() => router.push(`/(app)/quests/${quest.id}` as any))}>
      <Card variant="elevated" size="sm">
        <HStack className="items-center gap-3">
          {imageUrl ? (
            <Image source={{ uri: imageUrl }} className="w-14 h-14 rounded-lg flex-shrink-0" resizeMode="cover" />
          ) : (
            <View className="w-14 h-14 rounded-lg bg-optio-purple/10 items-center justify-center flex-shrink-0">
              <Ionicons name="rocket-outline" size={24} color="#6D469B" />
            </View>
          )}
          <VStack className="flex-1 min-w-0" space="xs">
            <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>{quest.title}</UIText>
            <HStack className="items-center gap-2">
              <Badge action={quest.is_active ? 'success' : 'error'}>
                <BadgeText className={quest.is_active ? 'text-green-700' : 'text-red-700'}>
                  {quest.is_active ? 'Active' : 'Inactive'}
                </BadgeText>
              </Badge>
              <Badge action="muted"><BadgeText className="text-typo-500 capitalize dark:text-dark-typo-500">{quest.quest_type || 'optio'}</BadgeText></Badge>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{quest.is_public ? 'Public' : 'Private'}</UIText>
            </HStack>
          </VStack>
          <Pressable
            onPress={(e: any) => { e.stopPropagation(); onDelete(); }}
            className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center active:bg-red-100"
          >
            <Ionicons name="trash-outline" size={14} color="#EF4444" />
          </Pressable>
        </HStack>
      </Card>
    </Pressable>
  );
}

function QuestDetailPanel({ quest, onClose, onDelete, onUpdate }: {
  quest: any; onClose: () => void; onDelete: () => void; onUpdate: (questId: string, updates: Record<string, any>) => void;
}) {
  const c = useThemeColors();
  const [detailTab, setDetailTab] = useState<'details' | 'settings' | 'actions'>('details');
  const [title, setTitle] = useState(quest.title || '');
  const [description, setDescription] = useState(quest.description || '');
  const [saving, setSaving] = useState(false);
  const imageUrl = quest.header_image_url || quest.image_url;

  // Sync local state when quest prop changes
  useEffect(() => {
    setTitle(quest.title || '');
    setDescription(quest.description || '');
  }, [quest.id, quest.title, quest.description]);

  const handleSave = async () => {
    setSaving(true);
    try {
      onUpdate(quest.id, { title, description });
    } catch { /* error */ }
    finally { setSaving(false); }
  };

  const handleToggleActive = () => onUpdate(quest.id, { is_active: !quest.is_active });
  const handleTogglePublic = () => onUpdate(quest.id, { is_public: !quest.is_public });

  return (
    <Card variant="elevated" size="md">
      <VStack space="md">
        {/* Header */}
        <HStack className="items-start justify-between">
          <HStack className="items-center gap-3 flex-1 min-w-0">
            {imageUrl ? (
              <Image source={{ uri: imageUrl }} style={{ width: 48, height: 48, borderRadius: 10 }} resizeMode="cover" />
            ) : (
              <View className="w-12 h-12 rounded-xl bg-optio-purple/10 items-center justify-center">
                <Ionicons name="rocket-outline" size={22} color="#6D469B" />
              </View>
            )}
            <VStack className="flex-1 min-w-0">
              <Heading size="sm" numberOfLines={1}>{quest.title}</Heading>
              <HStack className="items-center gap-2">
                <Badge action={quest.is_active ? 'success' : 'error'}>
                  <BadgeText className={quest.is_active ? 'text-green-700' : 'text-red-700'}>
                    {quest.is_active ? 'Active' : 'Inactive'}
                  </BadgeText>
                </Badge>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{quest.is_public ? 'Public' : 'Private'}</UIText>
              </HStack>
            </VStack>
          </HStack>
          <Pressable onPress={onClose} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center dark:bg-dark-surface-200">
            <Ionicons name="close" size={18} color={c.icon} />
          </Pressable>
        </HStack>

        {/* Sub-tabs */}
        <HStack className="bg-surface-100 rounded-lg p-1 dark:bg-dark-surface-200" space="xs">
          {([
            { key: 'details' as const, label: 'Details' },
            { key: 'settings' as const, label: 'Settings' },
            { key: 'actions' as const, label: 'Actions' },
          ]).map((t) => (
            <Pressable key={t.key} onPress={() => setDetailTab(t.key)} className={`flex-1 py-2 rounded-md items-center ${detailTab === t.key ? 'bg-white dark:bg-dark-surface-100' : ''}`}>
              <UIText size="xs" className={detailTab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>{t.label}</UIText>
            </Pressable>
          ))}
        </HStack>

        {/* Details tab - edit title, description, big idea */}
        {detailTab === 'details' && (
          <VStack space="sm">
            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Title</UIText>
              <Input><InputField value={title} onChangeText={setTitle} /></Input>
            </VStack>
            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Description</UIText>
              <TextInput
                className="border border-surface-200 rounded-lg p-3 text-sm min-h-[80px] font-poppins dark:border-dark-surface-300"
                style={{ fontFamily: 'Poppins_400Regular' }}
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
                placeholderTextColor={c.textFaint}
              />
            </VStack>
            <Button onPress={handleSave} loading={saving} disabled={!title.trim()}>
              <ButtonText>Save Changes</ButtonText>
            </Button>
          </VStack>
        )}

        {/* Settings tab - toggles */}
        {detailTab === 'settings' && (
          <VStack space="sm">
            <Pressable onPress={handleToggleActive} className="flex-row items-center justify-between px-4 py-3 bg-surface-50 rounded-xl active:bg-surface-100 dark:bg-dark-surface-50">
              <VStack>
                <UIText size="sm" className="font-poppins-medium">Active Status</UIText>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                  {quest.is_active ? 'Quest is visible and enrollable' : 'Quest is hidden from students'}
                </UIText>
              </VStack>
              <Badge action={quest.is_active ? 'success' : 'error'}>
                <BadgeText className={quest.is_active ? 'text-green-700' : 'text-red-700'}>
                  {quest.is_active ? 'Active' : 'Inactive'}
                </BadgeText>
              </Badge>
            </Pressable>

            <Pressable onPress={handleTogglePublic} className="flex-row items-center justify-between px-4 py-3 bg-surface-50 rounded-xl active:bg-surface-100 dark:bg-dark-surface-50">
              <VStack>
                <UIText size="sm" className="font-poppins-medium">Visibility</UIText>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                  {quest.is_public ? 'Visible in quest discovery' : 'Only accessible via direct link'}
                </UIText>
              </VStack>
              <Badge action={quest.is_public ? 'info' : 'muted'}>
                <BadgeText className={quest.is_public ? 'text-blue-700' : 'text-typo-500 dark:text-dark-typo-500'}>
                  {quest.is_public ? 'Public' : 'Private'}
                </BadgeText>
              </Badge>
            </Pressable>

            <HStack className="items-center justify-between px-4 py-3 bg-surface-50 rounded-xl dark:bg-dark-surface-50">
              <VStack>
                <UIText size="sm" className="font-poppins-medium">Quest Type</UIText>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">How tasks are assigned</UIText>
              </VStack>
              <Badge action="muted"><BadgeText className="text-typo-500 capitalize dark:text-dark-typo-500">{quest.quest_type || 'optio'}</BadgeText></Badge>
            </HStack>
          </VStack>
        )}

        {/* Actions tab */}
        {detailTab === 'actions' && (
          <VStack space="sm">
            <Pressable
              onPress={() => router.push(`/(app)/quests/${quest.id}` as any)}
              className="flex-row items-center gap-3 px-4 py-3 bg-optio-purple/5 rounded-xl active:bg-optio-purple/10"
            >
              <Ionicons name="open-outline" size={20} color="#6D469B" />
              <VStack>
                <UIText size="sm" className="font-poppins-medium text-optio-purple">View Quest</UIText>
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Open the student-facing quest page</UIText>
              </VStack>
            </Pressable>

            <Pressable className="flex-row items-center gap-3 px-4 py-3 bg-blue-50 rounded-xl active:bg-blue-100">
              <Ionicons name="image-outline" size={20} color="#1D4ED8" />
              <VStack>
                <UIText size="sm" className="font-poppins-medium text-blue-700">Update Image</UIText>
                <UIText size="xs" className="text-blue-600">Upload or regenerate quest image</UIText>
              </VStack>
            </Pressable>

            <Divider className="my-1" />

            <Pressable onPress={onDelete} className="flex-row items-center gap-3 px-4 py-3 bg-red-50 rounded-xl active:bg-red-100">
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
              <VStack>
                <UIText size="sm" className="font-poppins-medium text-red-700">Delete Quest</UIText>
                <UIText size="xs" className="text-red-600">Permanently remove this quest and all enrollments</UIText>
              </VStack>
            </Pressable>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

function QuestsPanel() {
  const c = useThemeColors();
  const { quests, loading, search, setSearch, deleteQuest, updateQuest, refetch } = useAdminQuests();
  const { orgs } = useAdminOrganizations();
  const orgLookup = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const o of orgs) map[o.id] = o.name;
    return map;
  }, [orgs]);
  const { isDesktop } = useBreakpoint();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedQuestId, setSelectedQuestId] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Derive selectedQuest from the quests list so it stays fresh after refetch
  const selectedQuest = selectedQuestId ? quests.find((q: any) => q.id === selectedQuestId) || null : null;
  const setSelectedQuest = (q: any | null) => setSelectedQuestId(q?.id || null);

  const filtered = quests.filter((q: any) => {
    if (statusFilter === 'active') return q.is_active;
    if (statusFilter === 'inactive') return !q.is_active;
    return true;
  });

  return (
    <VStack space="md">
      {/* Search + New Quest */}
      <HStack className="gap-3">
        <View className="flex-1">
          <Input variant="rounded">
            <InputSlot className="ml-3"><InputIcon as="search-outline" /></InputSlot>
            <InputField placeholder="Search quests..." value={search} onChangeText={setSearch} />
          </Input>
        </View>
        <Button size="md" onPress={() => setShowCreateModal(true)}>
          <ButtonText>+ New Quest</ButtonText>
        </Button>
      </HStack>

      {/* Status filter */}
      <HStack space="xs">
        {(['all', 'active', 'inactive'] as const).map((s) => (
          <Pressable key={s} onPress={() => setStatusFilter(s)}>
            <View className={`px-3 py-1.5 rounded-full ${statusFilter === s ? 'bg-optio-purple' : 'bg-surface-200 dark:bg-dark-surface-300'}`}>
              <UIText size="xs" className={`font-poppins-medium capitalize ${statusFilter === s ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>
                {s === 'all' ? `All (${quests.length})` : s}
              </UIText>
            </View>
          </Pressable>
        ))}
      </HStack>

      {/* Quest list */}
      {loading ? (
        <VStack space="sm">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</VStack>
      ) : filtered.length > 0 ? (
        isDesktop ? (
          <View style={{ flexDirection: 'row', gap: 16 }}>
            <View style={{ flex: selectedQuest ? 3 : 1 }}>
              <Card variant="elevated" size="sm" className="overflow-hidden">
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.border }}>
                  <View style={{ flex: 0.5 }} />
                  <View style={{ flex: 3 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Title</UIText></View>
                  <View style={{ flex: 1.5 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Created By</UIText></View>
                  <View style={{ flex: 1.5 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Organization</UIText></View>
                  <View style={{ flex: 1 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Type</UIText></View>
                  <View style={{ flex: 1 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Status</UIText></View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Visibility</UIText></View>
                </View>
                {filtered.map((q: any) => (
                  <QuestRowDesktop
                    key={q.id}
                    quest={q}
                    isSelected={selectedQuest?.id === q.id}
                    onSelect={() => setSelectedQuest(selectedQuest?.id === q.id ? null : q)}
                    orgName={q.organization_id ? orgLookup[q.organization_id] : undefined}
                  />
                ))}
              </Card>
            </View>
            {selectedQuest && (
              <View style={{ flex: 2 }}>
                <QuestDetailPanel
                  quest={selectedQuest}
                  onClose={() => setSelectedQuest(null)}
                  onDelete={() => { if (confirm(`Delete "${selectedQuest.title}"?`)) { deleteQuest(selectedQuest.id); setSelectedQuest(null); } }}
                  onUpdate={updateQuest}
                />
              </View>
            )}
          </View>
        ) : (
          <VStack space="sm">
            {filtered.map((q: any) => (
              <VStack key={q.id} space="sm">
                <QuestCardMobile
                  quest={q}
                  onSelect={() => setSelectedQuest(selectedQuest?.id === q.id ? null : q)}
                  onDelete={() => { if (confirm(`Delete "${q.title}"?`)) deleteQuest(q.id); }}
                />
                {selectedQuest?.id === q.id && (
                  <QuestDetailPanel
                    quest={q}
                    onClose={() => setSelectedQuest(null)}
                    onDelete={() => { if (confirm(`Delete "${q.title}"?`)) { deleteQuest(q.id); setSelectedQuest(null); } }}
                    onUpdate={updateQuest}
                  />
                )}
              </VStack>
            ))}
          </VStack>
        )
      ) : (
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="rocket-outline" size={40} color={c.iconMuted} />
          <Heading size="sm" className="text-typo-500 mt-3 dark:text-dark-typo-500">No quests found</Heading>
          <UIText size="sm" className="text-typo-400 mt-1 dark:text-dark-typo-400">Try a different search or filter</UIText>
        </Card>
      )}

      <CreateQuestModal
        visible={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={refetch}
      />
    </VStack>
  );
}

// ── Organizations Tab ──

// ── Org Management View ──

function OrgManageView({ orgId, onBack }: { orgId: string; onBack: () => void }) {
  const c = useThemeColors();
  const { org, users, loading, refetch } = useOrgDetail(orgId);
  const [orgTab, setOrgTab] = useState<'settings' | 'people' | 'content'>('settings');
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [saving, setSaving] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addingUser, setAddingUser] = useState(false);

  useEffect(() => {
    if (org) {
      setEditName(org.name || '');
      setEditSlug(org.slug || '');
    }
  }, [org?.id]);

  const handleSaveSettings = async () => {
    setSaving(true);
    try {
      await api.put(`/api/admin/organizations/${orgId}`, { name: editName, slug: editSlug });
      refetch();
    } catch { /* error */ }
    finally { setSaving(false); }
  };

  const handleToggleActive = async () => {
    try {
      await api.put(`/api/admin/organizations/${orgId}`, { is_active: !org.is_active });
      refetch();
    } catch { /* error */ }
  };

  const handleSetPolicy = async (policy: string) => {
    try {
      await api.put(`/api/admin/organizations/${orgId}`, { quest_visibility_policy: policy });
      refetch();
    } catch { /* error */ }
  };

  const handleAddUser = async () => {
    if (!addEmail.trim()) return;
    setAddingUser(true);
    try {
      await api.post(`/api/admin/organizations/${orgId}/users/add`, { email: addEmail.trim() });
      setAddEmail('');
      refetch();
    } catch { /* error */ }
    finally { setAddingUser(false); }
  };

  const handleRemoveUser = async (userId: string) => {
    try {
      await api.post(`/api/admin/organizations/${orgId}/users/remove`, { user_id: userId });
      refetch();
    } catch { /* error */ }
  };

  const handleChangeOrgRole = async (userId: string, orgRole: string) => {
    try {
      await api.put(`/api/admin/users/${userId}/org-role`, { org_role: orgRole });
      refetch();
    } catch { /* error */ }
  };

  if (loading) {
    return (
      <VStack space="md">
        <Skeleton className="h-10 w-48 rounded" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-60 rounded-xl" />
      </VStack>
    );
  }

  if (!org) {
    return (
      <VStack space="md">
        <UIText className="text-typo-500 dark:text-dark-typo-500">Organization not found.</UIText>
        <Button variant="outline" onPress={onBack}><ButtonText>Back</ButtonText></Button>
      </VStack>
    );
  }

  const orgTabs = [
    { key: 'settings' as const, label: 'Settings', icon: 'settings-outline' as keyof typeof Ionicons.glyphMap },
    { key: 'people' as const, label: `People (${users.length})`, icon: 'people-outline' as keyof typeof Ionicons.glyphMap },
    { key: 'content' as const, label: 'Content', icon: 'library-outline' as keyof typeof Ionicons.glyphMap },
  ];

  return (
    <VStack space="md">
      {/* Header */}
      <HStack className="items-center gap-3">
        <Pressable onPress={onBack} className="w-9 h-9 rounded-lg bg-surface-100 items-center justify-center active:bg-surface-200 dark:bg-dark-surface-200">
          <Ionicons name="arrow-back" size={18} color={c.icon} />
        </Pressable>
        <VStack className="flex-1">
          <Heading size="lg">{org.name}</Heading>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">/{org.slug}</UIText>
        </VStack>
        <Badge action={org.is_active ? 'success' : 'error'}>
          <BadgeText className={org.is_active ? 'text-green-700' : 'text-red-700'}>
            {org.is_active ? 'Active' : 'Inactive'}
          </BadgeText>
        </Badge>
      </HStack>

      {/* Sub-tabs */}
      <HStack className="bg-surface-100 rounded-lg p-1 dark:bg-dark-surface-200" space="xs">
        {orgTabs.map((t) => (
          <Pressable key={t.key} onPress={() => setOrgTab(t.key)} className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-md ${orgTab === t.key ? 'bg-white dark:bg-dark-surface-100' : ''}`}>
            <Ionicons name={t.icon} size={14} color={orgTab === t.key ? '#6D469B' : c.iconMuted} />
            <UIText size="xs" className={orgTab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>{t.label}</UIText>
          </Pressable>
        ))}
      </HStack>

      {/* Settings tab */}
      {orgTab === 'settings' && (
        <VStack space="md">
          <Card variant="elevated" size="md">
            <VStack space="sm">
              <UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Organization Name</UIText>
              <Input><InputField value={editName} onChangeText={setEditName} /></Input>
              <UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Slug</UIText>
              <Input><InputField value={editSlug} onChangeText={(t) => setEditSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} /></Input>
              <Button onPress={handleSaveSettings} loading={saving} disabled={!editName.trim() || !editSlug.trim()}>
                <ButtonText>Save</ButtonText>
              </Button>
            </VStack>
          </Card>

          <Card variant="elevated" size="md">
            <VStack space="sm">
              <UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Quest Visibility Policy</UIText>
              <View className="flex flex-row flex-wrap gap-2">
                {['all_optio', 'curated', 'private_only'].map((p) => (
                  <Pressable key={p} onPress={() => handleSetPolicy(p)}>
                    <View className={`px-4 py-2.5 rounded-lg ${org.quest_visibility_policy === p ? 'bg-optio-purple' : 'bg-surface-100 active:bg-surface-200 dark:bg-dark-surface-200'}`}>
                      <UIText size="xs" className={`font-poppins-medium capitalize ${org.quest_visibility_policy === p ? 'text-white' : 'text-typo-500 dark:text-dark-typo-500'}`}>
                        {p.replace(/_/g, ' ')}
                      </UIText>
                    </View>
                  </Pressable>
                ))}
              </View>
            </VStack>
          </Card>

          <Pressable onPress={handleToggleActive} className="flex-row items-center justify-between px-4 py-3 bg-surface-50 rounded-xl active:bg-surface-100 dark:bg-dark-surface-50">
            <VStack>
              <UIText size="sm" className="font-poppins-medium">Organization Status</UIText>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                {org.is_active ? 'Organization is active and visible' : 'Organization is deactivated'}
              </UIText>
            </VStack>
            <Badge action={org.is_active ? 'success' : 'error'}>
              <BadgeText className={org.is_active ? 'text-green-700' : 'text-red-700'}>
                {org.is_active ? 'Active' : 'Inactive'}
              </BadgeText>
            </Badge>
          </Pressable>
        </VStack>
      )}

      {/* People tab */}
      {orgTab === 'people' && (
        <VStack space="md">
          {/* Add user */}
          <Card variant="outline" size="md">
            <VStack space="sm">
              <UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Add User by Email</UIText>
              <HStack className="gap-2">
                <View className="flex-1">
                  <Input><InputField placeholder="user@example.com" value={addEmail} onChangeText={setAddEmail} keyboardType="email-address" autoCapitalize="none" /></Input>
                </View>
                <Button onPress={handleAddUser} loading={addingUser} disabled={!addEmail.trim()}>
                  <ButtonText>Add</ButtonText>
                </Button>
              </HStack>
            </VStack>
          </Card>

          {/* User list */}
          {users.length > 0 ? (
            <Card variant="elevated" size="sm" className="overflow-hidden">
              <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: c.background, borderBottomWidth: 1, borderBottomColor: c.border }}>
                <View style={{ flex: 3 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">User</UIText></View>
                <View style={{ flex: 2 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Email</UIText></View>
                <View style={{ flex: 1.5 }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Org Role</UIText></View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}><UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Actions</UIText></View>
              </View>
              {users.map((u: any) => {
                const initials = `${u.first_name?.[0] || ''}${u.last_name?.[0] || ''}`.toUpperCase();
                const orgRole = u.org_role || 'student';
                return (
                  <React.Fragment key={u.id}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10 }}>
                      <View style={{ flex: 3, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Avatar size="xs"><AvatarFallbackText>{initials}</AvatarFallbackText></Avatar>
                        <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                          {u.display_name || `${u.first_name || ''} ${u.last_name || ''}`}
                        </UIText>
                      </View>
                      <View style={{ flex: 2 }}>
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>{u.email}</UIText>
                      </View>
                      <View style={{ flex: 1.5 }}>
                        <Pressable
                          onPress={() => {
                            const roles = ['student', 'parent', 'advisor', 'org_admin'];
                            const currentIdx = roles.indexOf(orgRole);
                            const nextRole = roles[(currentIdx + 1) % roles.length];
                            handleChangeOrgRole(u.id, nextRole);
                          }}
                        >
                          <RoleBadge role={orgRole} />
                        </Pressable>
                      </View>
                      <View style={{ flex: 1, alignItems: 'flex-end' }}>
                        <Pressable
                          onPress={() => { if (confirm(`Remove ${u.email} from organization?`)) handleRemoveUser(u.id); }}
                          className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center active:bg-red-100"
                        >
                          <Ionicons name="person-remove-outline" size={14} color="#EF4444" />
                        </Pressable>
                      </View>
                    </View>
                    <Divider />
                  </React.Fragment>
                );
              })}
            </Card>
          ) : (
            <Card variant="filled" size="lg" className="items-center py-8">
              <Ionicons name="people-outline" size={36} color={c.iconMuted} />
              <UIText size="sm" className="text-typo-500 mt-2 dark:text-dark-typo-500">No users in this organization</UIText>
            </Card>
          )}
        </VStack>
      )}

      {/* Content tab */}
      {orgTab === 'content' && (
        <VStack space="md">
          <Card variant="filled" size="md">
            <VStack space="sm" className="items-center py-4">
              <Ionicons name="library-outline" size={36} color={c.iconMuted} />
              <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Content management coming soon</UIText>
              <UIText size="xs" className="text-typo-400 text-center dark:text-dark-typo-400">
                Grant/revoke quests and courses for this organization
              </UIText>
            </VStack>
          </Card>
        </VStack>
      )}
    </VStack>
  );
}

// ── Organizations Panel ──

function OrganizationsPanel() {
  const c = useThemeColors();
  const { orgs, loading, createOrg, deleteOrg } = useAdminOrganizations();
  const [showCreate, setShowCreate] = useState(false);
  const [managingOrgId, setManagingOrgId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  const handleCreate = async () => {
    if (!newName.trim() || !newSlug.trim()) return;
    await createOrg({ name: newName.trim(), slug: newSlug.trim() });
    setNewName('');
    setNewSlug('');
    setShowCreate(false);
  };

  // Show manage view when an org is selected
  if (managingOrgId) {
    return <OrgManageView orgId={managingOrgId} onBack={() => setManagingOrgId(null)} />;
  }

  return (
    <VStack space="md">
      <HStack className="items-center justify-between">
        <Heading size="md">Organizations</Heading>
        <Button size="sm" onPress={() => setShowCreate(!showCreate)}>
          <ButtonText>{showCreate ? 'Cancel' : '+ New Org'}</ButtonText>
        </Button>
      </HStack>

      {showCreate && (
        <Card variant="outline" size="md">
          <VStack space="sm">
            <Input><InputField placeholder="Organization name" value={newName} onChangeText={setNewName} /></Input>
            <Input><InputField placeholder="Slug (URL-friendly)" value={newSlug} onChangeText={(t) => setNewSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} /></Input>
            <Button size="sm" onPress={handleCreate} disabled={!newName.trim() || !newSlug.trim()}>
              <ButtonText>Create</ButtonText>
            </Button>
          </VStack>
        </Card>
      )}

      {loading ? (
        <VStack space="sm">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</VStack>
      ) : orgs.length > 0 ? (
        <View className="flex flex-col md:flex-row md:flex-wrap gap-4">
          {orgs.map((org) => (
            <View key={org.id} className="md:w-[calc(50%-8px)]">
              <Card variant="elevated" size="md">
                <HStack className="items-center justify-between">
                  <VStack>
                    <Heading size="sm">{org.name}</Heading>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">/{org.slug}</UIText>
                    <HStack className="items-center gap-2 mt-1">
                      <Badge action={org.is_active ? 'success' : 'error'}>
                        <BadgeText className={org.is_active ? 'text-green-700' : 'text-red-700'}>
                          {org.is_active ? 'Active' : 'Inactive'}
                        </BadgeText>
                      </Badge>
                      <Badge action="muted">
                        <BadgeText className="text-typo-500 capitalize dark:text-dark-typo-500">{org.quest_visibility_policy?.replace(/_/g, ' ') || 'all'}</BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>
                  <HStack className="gap-2">
                    <Button size="xs" variant="outline" onPress={() => setManagingOrgId(org.id)}>
                      <ButtonText>Manage</ButtonText>
                    </Button>
                    <Pressable
                      onPress={() => { if (confirm(`Delete "${org.name}"?`)) deleteOrg(org.id); }}
                      className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center active:bg-red-100"
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </HStack>
                </HStack>
              </Card>
            </View>
          ))}
        </View>
      ) : (
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="business-outline" size={40} color={c.iconMuted} />
          <Heading size="sm" className="text-typo-500 mt-3 dark:text-dark-typo-500">No organizations</Heading>
        </Card>
      )}
    </VStack>
  );
}

// ── Emails Tab ──

const automatedEmails = [
  { name: 'Welcome Email', trigger: 'User registration', status: 'active' },
  { name: 'Email Verification', trigger: 'Account creation', status: 'active' },
  { name: 'Password Reset', trigger: 'Forgot password', status: 'active' },
  { name: 'Quest Completion', trigger: 'Quest finished', status: 'active' },
  { name: 'Parent Link Request', trigger: 'Child requests link', status: 'active' },
  { name: 'Observer Invitation', trigger: 'Observer invited', status: 'active' },
  { name: 'Organization Invitation', trigger: 'Org invite sent', status: 'active' },
  { name: 'Parental Consent (COPPA)', trigger: 'Minor account created', status: 'active' },
  { name: 'Task Approval', trigger: 'Task reviewed', status: 'active' },
  { name: 'Weekly Progress', trigger: 'Weekly cron', status: 'active' },
];

function EmailsPanel() {
  return (
    <VStack space="sm">
      <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">Automated system emails (read-only reference)</UIText>
      {automatedEmails.map((e, i) => (
        <Card key={i} variant="outline" size="sm">
          <HStack className="items-center justify-between">
            <VStack>
              <UIText size="sm" className="font-poppins-medium">{e.name}</UIText>
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{e.trigger}</UIText>
            </VStack>
            <Badge action="success"><BadgeText className="text-green-700">{e.status}</BadgeText></Badge>
          </HStack>
        </Card>
      ))}
    </VStack>
  );
}

// ── Bulk Generate Tab ──

function BulkGeneratePanel() {
  const c = useThemeColors();
  const [topics, setTopics] = useState('');
  const [generating, setGenerating] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);

  const handleGenerate = async () => {
    const topicList = topics.split('\n').map((t: string) => t.trim()).filter(Boolean);
    if (topicList.length === 0) return;
    setGenerating(true);
    try {
      const { data } = await api.post('/api/admin/curriculum/generate/bulk', {
        topics: topicList,
        auto_publish: false,
      });
      setJobs(data.jobs || []);
      setTopics('');
    } catch {
      // Error
    } finally {
      setGenerating(false);
    }
  };

  return (
    <VStack space="md">
      <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500">
        Generate multiple courses at once from a list of topics. One topic per line.
      </UIText>

      <Card variant="outline" size="md">
        <VStack space="sm">
          <UIText size="xs" className="text-typo-400 font-poppins-medium dark:text-dark-typo-400">Topics (one per line)</UIText>
          <TextInput
            className="border border-surface-200 rounded-lg p-3 text-sm min-h-[160px] font-poppins dark:border-dark-surface-300"
            placeholder={"Introduction to Photography\nBasic Web Development\nCreative Writing Workshop"}
            value={topics}
            onChangeText={setTopics}
            multiline
            textAlignVertical="top"
            placeholderTextColor={c.textFaint}
          />
          <HStack className="items-center justify-between">
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
              {topics.split('\n').filter((t: string) => t.trim()).length} topic(s)
            </UIText>
            <Button onPress={handleGenerate} loading={generating} disabled={!topics.trim()}>
              <ButtonText>Generate Courses</ButtonText>
            </Button>
          </HStack>
        </VStack>
      </Card>

      {jobs.length > 0 && (
        <VStack space="sm">
          <Heading size="sm">Generation Jobs</Heading>
          {jobs.map((job: any, idx: number) => (
            <Card key={idx} variant="outline" size="sm">
              <HStack className="items-center justify-between">
                <VStack>
                  <UIText size="sm" className="font-poppins-medium">{job.topic || job.title || `Job ${idx + 1}`}</UIText>
                  <UIText size="xs" className="text-typo-400 capitalize dark:text-dark-typo-400">{job.status || 'pending'}</UIText>
                </VStack>
                <Badge action={job.status === 'completed' ? 'success' : job.status === 'failed' ? 'error' : 'info'}>
                  <BadgeText className={
                    job.status === 'completed' ? 'text-green-700' :
                    job.status === 'failed' ? 'text-red-700' : 'text-blue-700'
                  }>{job.status || 'pending'}</BadgeText>
                </Badge>
              </HStack>
            </Card>
          ))}
        </VStack>
      )}
    </VStack>
  );
}

// ── Docs Tab ──

function DocsPanel() {
  const c = useThemeColors();
  const [categories, setCategories] = useState<any[]>([]);
  const [articles, setArticles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'categories' | 'articles'>('categories');

  useEffect(() => {
    (async () => {
      try {
        const [catRes, artRes] = await Promise.allSettled([
          api.get('/api/admin/docs/categories'),
          api.get('/api/admin/docs/articles'),
        ]);
        if (catRes.status === 'fulfilled') setCategories(catRes.value.data.categories || catRes.value.data || []);
        if (artRes.status === 'fulfilled') setArticles(artRes.value.data.articles || artRes.value.data || []);
      } catch {
        // Error
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <VStack space="md">
      <HStack className="items-center justify-between">
        <HStack className="bg-surface-100 rounded-lg p-1 dark:bg-dark-surface-200" space="xs">
          <Pressable onPress={() => setActiveView('categories')}>
            <View className={`px-4 py-2 rounded-md ${activeView === 'categories' ? 'bg-white dark:bg-dark-surface-100' : ''}`}>
              <UIText size="sm" className={activeView === 'categories' ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>
                Categories ({categories.length})
              </UIText>
            </View>
          </Pressable>
          <Pressable onPress={() => setActiveView('articles')}>
            <View className={`px-4 py-2 rounded-md ${activeView === 'articles' ? 'bg-white dark:bg-dark-surface-100' : ''}`}>
              <UIText size="sm" className={activeView === 'articles' ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>
                Articles ({articles.length})
              </UIText>
            </View>
          </Pressable>
        </HStack>
        <Button size="sm">
          <ButtonText>+ New {activeView === 'categories' ? 'Category' : 'Article'}</ButtonText>
        </Button>
      </HStack>

      {loading ? (
        <VStack space="sm">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</VStack>
      ) : activeView === 'categories' ? (
        categories.length > 0 ? (
          <VStack space="sm">
            {categories.map((cat: any) => (
              <Card key={cat.id} variant="outline" size="sm">
                <HStack className="items-center justify-between">
                  <VStack>
                    <UIText size="sm" className="font-poppins-medium">{cat.name || cat.title}</UIText>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{cat.slug || ''} - {cat.article_count || 0} articles</UIText>
                  </VStack>
                  <HStack className="gap-2">
                    <Pressable className="w-8 h-8 rounded-lg bg-surface-100 items-center justify-center dark:bg-dark-surface-200">
                      <Ionicons name="create-outline" size={16} color={c.icon} />
                    </Pressable>
                    <Pressable className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center">
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </HStack>
                </HStack>
              </Card>
            ))}
          </VStack>
        ) : (
          <Card variant="filled" size="lg" className="items-center py-10">
            <Ionicons name="folder-outline" size={40} color={c.iconMuted} />
            <Heading size="sm" className="text-typo-500 mt-3 dark:text-dark-typo-500">No categories</Heading>
            <UIText size="sm" className="text-typo-400 mt-1 dark:text-dark-typo-400">Create a category to organize help articles</UIText>
          </Card>
        )
      ) : (
        articles.length > 0 ? (
          <VStack space="sm">
            {articles.map((art: any) => (
              <Card key={art.id} variant="outline" size="sm">
                <HStack className="items-center justify-between">
                  <VStack className="flex-1 min-w-0">
                    <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{art.title}</UIText>
                    <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{art.category_name || 'Uncategorized'} - {art.status || 'draft'}</UIText>
                  </VStack>
                  <HStack className="gap-2">
                    <Badge action={art.status === 'published' ? 'success' : 'muted'}>
                      <BadgeText className={art.status === 'published' ? 'text-green-700' : 'text-typo-500 dark:text-dark-typo-500'}>
                        {art.status || 'draft'}
                      </BadgeText>
                    </Badge>
                    <Pressable className="w-8 h-8 rounded-lg bg-surface-100 items-center justify-center dark:bg-dark-surface-200">
                      <Ionicons name="create-outline" size={16} color={c.icon} />
                    </Pressable>
                  </HStack>
                </HStack>
              </Card>
            ))}
          </VStack>
        ) : (
          <Card variant="filled" size="lg" className="items-center py-10">
            <Ionicons name="document-text-outline" size={40} color={c.iconMuted} />
            <Heading size="sm" className="text-typo-500 mt-3 dark:text-dark-typo-500">No articles</Heading>
            <UIText size="sm" className="text-typo-400 mt-1 dark:text-dark-typo-400">Create help articles for your users</UIText>
          </Card>
        )
      )}
    </VStack>
  );
}

// ── Main Admin Page ──

export default function AdminScreen() {
  const { user } = useAuthStore();
  const c = useThemeColors();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  const role = user?.role;

  // Superadmin can use the admin tools on any platform (native phone included,
  // reached via the kebab "Admin" link). Org-managed admins stay desktop-only --
  // the org workflows lean on the wide table layouts.
  if (Platform.OS !== 'web' && role !== 'superadmin') {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center dark:bg-dark-surface-50">
        <Ionicons name="desktop-outline" size={40} color={c.iconMuted} />
        <Heading size="sm" className="text-typo-500 mt-3 dark:text-dark-typo-500">Desktop Only</Heading>
        <UIText size="sm" className="text-typo-400 mt-1 dark:text-dark-typo-400">Admin tools are available on desktop.</UIText>
      </SafeAreaView>
    );
  }

  // Role check
  if (role !== 'superadmin' && role !== 'org_managed') {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center dark:bg-dark-surface-50">
        <Ionicons name="lock-closed-outline" size={40} color={c.iconMuted} />
        <Heading size="sm" className="text-typo-500 mt-3 dark:text-dark-typo-500">Access Denied</Heading>
        <UIText size="sm" className="text-typo-400 mt-1 dark:text-dark-typo-400">Admin access required.</UIText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
      <ScrollView className="flex-1" contentContainerClassName="px-5 md:px-8 pt-6 pb-12" showsVerticalScrollIndicator={false}>
        <VStack space="lg" className="max-w-6xl w-full md:mx-auto">

          <Heading size="2xl">Admin Panel</Heading>

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <HStack className="bg-surface-100 rounded-xl p-1 dark:bg-dark-surface-200" space="xs">
              {tabs.filter((t) => VISIBLE_TAB_KEYS.includes(t.key)).map((t) => (
                <Pressable key={t.key} onPress={() => setActiveTab(t.key)}>
                  <HStack className={`items-center gap-2 px-4 py-2.5 rounded-lg ${activeTab === t.key ? 'bg-white dark:bg-dark-surface-100' : ''}`}>
                    <Ionicons name={t.icon} size={16} color={activeTab === t.key ? '#6D469B' : c.iconMuted} />
                    <UIText size="sm" className={activeTab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>
                      {t.label}
                    </UIText>
                  </HStack>
                </Pressable>
              ))}
            </HStack>
          </ScrollView>

          {/* Tab content */}
          {activeTab === 'users' && <UsersPanel />}
          {activeTab === 'quests' && <QuestsPanel />}
          {activeTab === 'orgs' && <OrganizationsPanel />}
          {activeTab === 'emails' && <EmailsPanel />}
          {activeTab === 'bulk' && <BulkGeneratePanel />}
          {activeTab === 'docs' && <DocsPanel />}

        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
