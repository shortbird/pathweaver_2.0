/**
 * Admin Panel - Web only. Superadmin/org_admin access.
 *
 * Tabs: Users, Quests, Organizations, Courses, Flagged Tasks, Emails
 */

import React, { useState, useEffect } from 'react';
import api from '@/src/services/api';
import { View, ScrollView, Pressable, Platform, TextInput, Alert, useWindowDimensions, Image } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { useAdminUsers, useAdminQuests, useAdminOrganizations, useOrgDetail, type AdminUser } from '@/src/hooks/useAdmin';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Divider, Skeleton, Input, InputField, InputSlot, InputIcon,
  Avatar, AvatarFallbackText, AvatarImage,
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

const roleColors: Record<string, string> = {
  superadmin: 'bg-red-100 text-red-700',
  org_admin: 'bg-purple-100 text-purple-700',
  advisor: 'bg-blue-100 text-blue-700',
  parent: 'bg-amber-100 text-amber-700',
  student: 'bg-green-100 text-green-700',
  observer: 'bg-gray-100 text-gray-700',
  org_managed: 'bg-indigo-100 text-indigo-700',
};

// ── Users Tab ──

function RoleBadge({ role }: { role: string }) {
  const rColor = roleColors[role] || roleColors.student;
  const [bg, text] = rColor.split(' ');
  const label = role === 'org_managed' ? 'Org' : role === 'org_admin' ? 'Org Admin' : role;
  return (
    <View className={`self-start px-2 py-0.5 rounded-full ${bg}`}>
      <UIText size="xs" className={`font-poppins-medium capitalize ${text}`}>{label}</UIText>
    </View>
  );
}

function UserCardMobile({ user, onMasquerade, onDelete, onSelect }: { user: AdminUser; onMasquerade: () => void; onDelete: () => void; onSelect?: () => void }) {
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
          <UIText size="xs" className="text-typo-400" numberOfLines={1}>{user.email}</UIText>
          <HStack className="items-center justify-between">
            <HStack className="items-center gap-3">
              <HStack className="items-center gap-1">
                <Ionicons name="star" size={12} color="#FF9028" />
                <UIText size="xs" className="text-typo-400">{(user.total_xp || 0).toLocaleString()} XP</UIText>
              </HStack>
              <HStack className="items-center gap-1">
                <Ionicons name="time-outline" size={12} color="#9CA3AF" />
                <UIText size="xs" className="text-typo-400">{lastActive}</UIText>
              </HStack>
            </HStack>
            <HStack className="gap-1">
              <Pressable
                onPress={onMasquerade}
                className="w-8 h-8 rounded-lg bg-surface-100 items-center justify-center active:bg-surface-200"
              >
                <Ionicons name="eye-outline" size={16} color="#6B7280" />
              </Pressable>
              <Pressable
                onPress={onDelete}
                className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center active:bg-red-100"
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
            <UIText size="xs" className="text-typo-400" numberOfLines={1}>{user.email}</UIText>
          </View>
          <View style={{ flex: 1.5 }}>
            <RoleBadge role={effectiveRole} />
          </View>
          <View style={{ flex: 1.5, alignItems: 'flex-end' }}>
            <UIText size="xs" className="text-typo-400">{lastActive}</UIText>
          </View>
        </View>
      </Pressable>
      <Divider />
    </>
  );
}

// ── User Detail Panel ──

function UserDetailPanel({ user, onClose, onMasquerade, onDelete, onResetPassword, onVerifyEmail, onUpdateRole }: {
  user: AdminUser;
  onClose: () => void;
  onMasquerade: () => void;
  onDelete: () => void;
  onResetPassword: (pw: string) => void;
  onVerifyEmail: () => void;
  onUpdateRole: (role: string, orgRole?: string) => void;
}) {
  const initials = `${user.first_name?.[0] || ''}${user.last_name?.[0] || ''}`.toUpperCase();
  const effectiveRole = user.role === 'org_managed' ? (user.org_role || 'org_managed') : user.role;
  const [detailTab, setDetailTab] = useState<'profile' | 'role' | 'actions'>('profile');
  const [newPassword, setNewPassword] = useState('');
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    : '';

  const detailTabs = [
    { key: 'profile' as const, label: 'Profile' },
    { key: 'role' as const, label: 'Role' },
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
              <UIText size="xs" className="text-typo-400">{user.email}</UIText>
              {memberSince && <UIText size="xs" className="text-typo-300">Member since {memberSince}</UIText>}
            </VStack>
          </HStack>
          <Pressable onPress={onClose} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
            <Ionicons name="close" size={18} color="#6B7280" />
          </Pressable>
        </HStack>

        {/* Sub-tabs */}
        <HStack className="bg-surface-100 rounded-lg p-1" space="xs">
          {detailTabs.map((t) => (
            <Pressable key={t.key} onPress={() => setDetailTab(t.key)} className={`flex-1 py-2 rounded-md items-center ${detailTab === t.key ? 'bg-white shadow-sm' : ''}`}>
              <UIText size="xs" className={detailTab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500'}>{t.label}</UIText>
            </Pressable>
          ))}
        </HStack>

        {/* Profile tab */}
        {detailTab === 'profile' && (
          <VStack space="sm">
            <HStack className="items-center justify-between py-1">
              <UIText size="xs" className="text-typo-400">Name</UIText>
              <UIText size="sm" className="font-poppins-medium">{user.first_name} {user.last_name}</UIText>
            </HStack>
            <Divider />
            <HStack className="items-center justify-between py-1">
              <UIText size="xs" className="text-typo-400">Email</UIText>
              <UIText size="sm">{user.email}</UIText>
            </HStack>
            <Divider />
            <HStack className="items-center justify-between py-1">
              <UIText size="xs" className="text-typo-400">Role</UIText>
              <RoleBadge role={effectiveRole} />
            </HStack>
            <Divider />
            <HStack className="items-center justify-between py-1">
              <UIText size="xs" className="text-typo-400">Total XP</UIText>
              <UIText size="sm" className="font-poppins-medium text-optio-purple">{(user.total_xp || 0).toLocaleString()}</UIText>
            </HStack>
            <Divider />
            <HStack className="items-center justify-between py-1">
              <UIText size="xs" className="text-typo-400">Dependent</UIText>
              <UIText size="sm">{user.is_dependent ? 'Yes' : 'No'}</UIText>
            </HStack>
            {user.organization_id && (
              <>
                <Divider />
                <HStack className="items-center justify-between py-1">
                  <UIText size="xs" className="text-typo-400">Organization</UIText>
                  <UIText size="sm">{user.organization_id.slice(0, 8)}...</UIText>
                </HStack>
              </>
            )}
          </VStack>
        )}

        {/* Role tab */}
        {detailTab === 'role' && (
          <VStack space="sm">
            <UIText size="xs" className="text-typo-400 font-poppins-medium">Change Role</UIText>
            <View className="flex flex-row flex-wrap gap-2">
              {['student', 'parent', 'advisor', 'observer', 'org_admin', 'superadmin'].map((r) => (
                <Pressable key={r} onPress={() => onUpdateRole(r)}>
                  <View className={`px-3 py-2 rounded-lg ${effectiveRole === r ? 'bg-optio-purple' : 'bg-surface-100 active:bg-surface-200'}`}>
                    <UIText size="xs" className={`font-poppins-medium capitalize ${effectiveRole === r ? 'text-white' : 'text-typo-500'}`}>
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
            <Pressable onPress={onMasquerade} className="flex-row items-center gap-3 px-4 py-3 bg-amber-50 rounded-xl active:bg-amber-100">
              <Ionicons name="eye-outline" size={20} color="#B45309" />
              <VStack>
                <UIText size="sm" className="font-poppins-medium text-amber-700">Masquerade</UIText>
                <UIText size="xs" className="text-amber-600">View platform as this user</UIText>
              </VStack>
            </Pressable>

            <Pressable onPress={onVerifyEmail} className="flex-row items-center gap-3 px-4 py-3 bg-blue-50 rounded-xl active:bg-blue-100">
              <Ionicons name="checkmark-circle-outline" size={20} color="#1D4ED8" />
              <VStack>
                <UIText size="sm" className="font-poppins-medium text-blue-700">Verify Email</UIText>
                <UIText size="xs" className="text-blue-600">Mark email as verified</UIText>
              </VStack>
            </Pressable>

            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Reset Password</UIText>
              <HStack className="gap-2">
                <View className="flex-1">
                  <Input size="sm">
                    <InputField
                      placeholder="New password"
                      value={newPassword}
                      onChangeText={setNewPassword}
                      autoComplete="off"
                      textContentType="none"
                    />
                  </Input>
                </View>
                <Button size="sm" disabled={!newPassword.trim()} onPress={() => { onResetPassword(newPassword); setNewPassword(''); }}>
                  <ButtonText>Reset</ButtonText>
                </Button>
              </HStack>
            </VStack>

            <Divider className="my-2" />

            <Pressable onPress={onDelete} className="flex-row items-center gap-3 px-4 py-3 bg-red-50 rounded-xl active:bg-red-100">
              <Ionicons name="trash-outline" size={20} color="#DC2626" />
              <VStack>
                <UIText size="sm" className="font-poppins-medium text-red-700">Delete User</UIText>
                <UIText size="xs" className="text-red-600">Permanently remove this account</UIText>
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
  const {
    users, total, loading, page, setPage, search, setSearch,
    roleFilter, setRoleFilter, perPage, totalPages,
    deleteUser, masquerade, updateUserRole, resetPassword, verifyEmail,
  } = useAdminUsers();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;
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
            <View className={`px-3 py-1.5 rounded-full ${!roleFilter ? 'bg-optio-purple' : 'bg-surface-200'}`}>
              <UIText size="xs" className={`font-poppins-medium ${!roleFilter ? 'text-white' : 'text-typo-500'}`}>All ({total})</UIText>
            </View>
          </Pressable>
          {roles.map((r) => (
            <Pressable key={r} onPress={() => { setRoleFilter(r); setPage(1); }}>
              <View className={`px-3 py-1.5 rounded-full ${roleFilter === r ? 'bg-optio-purple' : 'bg-surface-200'}`}>
                <UIText size="xs" className={`font-poppins-medium capitalize ${roleFilter === r ? 'text-white' : 'text-typo-500'}`}>
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
          <Ionicons name="people-outline" size={40} color="#9CA3AF" />
          <Heading size="sm" className="text-typo-500 mt-3">No users found</Heading>
          <UIText size="sm" className="text-typo-400 mt-1">Try a different search or filter</UIText>
        </Card>
      ) : isDesktop ? (
        /* Desktop: table + detail panel side by side */
        <View style={{ flexDirection: 'row', gap: 16 }}>
          <View style={{ flex: selectedUser ? 3 : 1 }}>
            <Card variant="elevated" size="sm" className="overflow-hidden">
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                <View style={{ flex: 3 }}><UIText size="xs" className="text-typo-400 font-poppins-medium">User</UIText></View>
                <View style={{ flex: 3 }}><UIText size="xs" className="text-typo-400 font-poppins-medium">Email</UIText></View>
                <View style={{ flex: 1.5 }}><UIText size="xs" className="text-typo-400 font-poppins-medium">Role</UIText></View>
                <View style={{ flex: 1.5, alignItems: 'flex-end' }}><UIText size="xs" className="text-typo-400 font-poppins-medium">Last Active</UIText></View>
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
                onResetPassword={(pw) => resetPassword(selectedUser.id, pw)}
                onVerifyEmail={() => verifyEmail(selectedUser.id)}
                onUpdateRole={(role) => updateUserRole(selectedUser.id, role)}
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
                  onResetPassword={(pw) => resetPassword(u.id, pw)}
                  onVerifyEmail={() => verifyEmail(u.id)}
                  onUpdateRole={(role) => updateUserRole(u.id, role)}
                />
              )}
            </VStack>
          ))}
        </VStack>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <HStack className="items-center justify-between">
          <UIText size="xs" className="text-typo-400">
            Showing {(page - 1) * perPage + 1}-{Math.min(page * perPage, total)} of {total}
          </UIText>
          <HStack className="items-center gap-2">
            <Pressable
              onPress={() => setPage(page - 1)}
              disabled={page <= 1}
              className={`w-9 h-9 rounded-lg items-center justify-center ${page <= 1 ? 'opacity-30' : 'bg-surface-100 active:bg-surface-200'}`}
            >
              <Ionicons name="chevron-back" size={18} color="#6B7280" />
            </Pressable>
            <UIText size="sm" className="text-typo-500 font-poppins-medium">{page} / {totalPages}</UIText>
            <Pressable
              onPress={() => setPage(page + 1)}
              disabled={page >= totalPages}
              className={`w-9 h-9 rounded-lg items-center justify-center ${page >= totalPages ? 'opacity-30' : 'bg-surface-100 active:bg-surface-200'}`}
            >
              <Ionicons name="chevron-forward" size={18} color="#6B7280" />
            </Pressable>
          </HStack>
        </HStack>
      )}
    </VStack>
  );
}

// ── Quests Tab ──

function QuestRowDesktop({ quest, onSelect, isSelected }: { quest: any; onSelect: () => void; isSelected: boolean }) {
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
          <View style={{ flex: 4 }}>
            <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>{quest.title}</UIText>
          </View>
          <View style={{ flex: 1.5 }}>
            <Badge action="muted"><BadgeText className="text-typo-500 capitalize">{quest.quest_type || 'optio'}</BadgeText></Badge>
          </View>
          <View style={{ flex: 1 }}>
            <Badge action={quest.is_active ? 'success' : 'error'}>
              <BadgeText className={quest.is_active ? 'text-green-700' : 'text-red-700'}>
                {quest.is_active ? 'Active' : 'Inactive'}
              </BadgeText>
            </Badge>
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <UIText size="xs" className="text-typo-400">
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
              <Badge action="muted"><BadgeText className="text-typo-500 capitalize">{quest.quest_type || 'optio'}</BadgeText></Badge>
              <UIText size="xs" className="text-typo-400">{quest.is_public ? 'Public' : 'Private'}</UIText>
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

function QuestDetailPanel({ quest, onClose, onDelete, onRefetch }: {
  quest: any; onClose: () => void; onDelete: () => void; onRefetch: () => void;
}) {
  const [detailTab, setDetailTab] = useState<'details' | 'settings' | 'actions'>('details');
  const [title, setTitle] = useState(quest.title || '');
  const [description, setDescription] = useState(quest.description || '');
  const [saving, setSaving] = useState(false);
  const imageUrl = quest.header_image_url || quest.image_url;

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put(`/api/v3/admin/quests/${quest.id}`, { title, description });
      onRefetch();
    } catch { /* error */ }
    finally { setSaving(false); }
  };

  const handleToggleActive = async () => {
    try {
      await api.put(`/api/v3/admin/quests/${quest.id}`, { is_active: !quest.is_active });
      onRefetch();
    } catch { /* error */ }
  };

  const handleTogglePublic = async () => {
    try {
      await api.put(`/api/v3/admin/quests/${quest.id}`, { is_public: !quest.is_public });
      onRefetch();
    } catch { /* error */ }
  };

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
                <UIText size="xs" className="text-typo-400">{quest.is_public ? 'Public' : 'Private'}</UIText>
              </HStack>
            </VStack>
          </HStack>
          <Pressable onPress={onClose} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
            <Ionicons name="close" size={18} color="#6B7280" />
          </Pressable>
        </HStack>

        {/* Sub-tabs */}
        <HStack className="bg-surface-100 rounded-lg p-1" space="xs">
          {([
            { key: 'details' as const, label: 'Details' },
            { key: 'settings' as const, label: 'Settings' },
            { key: 'actions' as const, label: 'Actions' },
          ]).map((t) => (
            <Pressable key={t.key} onPress={() => setDetailTab(t.key)} className={`flex-1 py-2 rounded-md items-center ${detailTab === t.key ? 'bg-white shadow-sm' : ''}`}>
              <UIText size="xs" className={detailTab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500'}>{t.label}</UIText>
            </Pressable>
          ))}
        </HStack>

        {/* Details tab - edit title, description, big idea */}
        {detailTab === 'details' && (
          <VStack space="sm">
            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Title</UIText>
              <Input><InputField value={title} onChangeText={setTitle} /></Input>
            </VStack>
            <VStack space="xs">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Description</UIText>
              <TextInput
                className="border border-surface-200 rounded-lg p-3 text-sm min-h-[80px] font-poppins"
                style={{ fontFamily: 'Poppins_400Regular' }}
                value={description}
                onChangeText={setDescription}
                multiline
                textAlignVertical="top"
                placeholderTextColor="#9CA3AF"
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
            <Pressable onPress={handleToggleActive} className="flex-row items-center justify-between px-4 py-3 bg-surface-50 rounded-xl active:bg-surface-100">
              <VStack>
                <UIText size="sm" className="font-poppins-medium">Active Status</UIText>
                <UIText size="xs" className="text-typo-400">
                  {quest.is_active ? 'Quest is visible and enrollable' : 'Quest is hidden from students'}
                </UIText>
              </VStack>
              <Badge action={quest.is_active ? 'success' : 'error'}>
                <BadgeText className={quest.is_active ? 'text-green-700' : 'text-red-700'}>
                  {quest.is_active ? 'Active' : 'Inactive'}
                </BadgeText>
              </Badge>
            </Pressable>

            <Pressable onPress={handleTogglePublic} className="flex-row items-center justify-between px-4 py-3 bg-surface-50 rounded-xl active:bg-surface-100">
              <VStack>
                <UIText size="sm" className="font-poppins-medium">Visibility</UIText>
                <UIText size="xs" className="text-typo-400">
                  {quest.is_public ? 'Visible in quest discovery' : 'Only accessible via direct link'}
                </UIText>
              </VStack>
              <Badge action={quest.is_public ? 'info' : 'muted'}>
                <BadgeText className={quest.is_public ? 'text-blue-700' : 'text-typo-500'}>
                  {quest.is_public ? 'Public' : 'Private'}
                </BadgeText>
              </Badge>
            </Pressable>

            <HStack className="items-center justify-between px-4 py-3 bg-surface-50 rounded-xl">
              <VStack>
                <UIText size="sm" className="font-poppins-medium">Quest Type</UIText>
                <UIText size="xs" className="text-typo-400">How tasks are assigned</UIText>
              </VStack>
              <Badge action="muted"><BadgeText className="text-typo-500 capitalize">{quest.quest_type || 'optio'}</BadgeText></Badge>
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
                <UIText size="xs" className="text-typo-400">Open the student-facing quest page</UIText>
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
  const { quests, loading, search, setSearch, deleteQuest, refetch } = useAdminQuests();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= 768;
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [selectedQuest, setSelectedQuest] = useState<any>(null);

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
        <Button size="md">
          <ButtonText>+ New Quest</ButtonText>
        </Button>
      </HStack>

      {/* Status filter */}
      <HStack space="xs">
        {(['all', 'active', 'inactive'] as const).map((s) => (
          <Pressable key={s} onPress={() => setStatusFilter(s)}>
            <View className={`px-3 py-1.5 rounded-full ${statusFilter === s ? 'bg-optio-purple' : 'bg-surface-200'}`}>
              <UIText size="xs" className={`font-poppins-medium capitalize ${statusFilter === s ? 'text-white' : 'text-typo-500'}`}>
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
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                  <View style={{ flex: 0.5 }} />
                  <View style={{ flex: 4 }}><UIText size="xs" className="text-typo-400 font-poppins-medium">Title</UIText></View>
                  <View style={{ flex: 1.5 }}><UIText size="xs" className="text-typo-400 font-poppins-medium">Type</UIText></View>
                  <View style={{ flex: 1 }}><UIText size="xs" className="text-typo-400 font-poppins-medium">Status</UIText></View>
                  <View style={{ flex: 1, alignItems: 'flex-end' }}><UIText size="xs" className="text-typo-400 font-poppins-medium">Visibility</UIText></View>
                </View>
                {filtered.map((q: any) => (
                  <QuestRowDesktop
                    key={q.id}
                    quest={q}
                    isSelected={selectedQuest?.id === q.id}
                    onSelect={() => setSelectedQuest(selectedQuest?.id === q.id ? null : q)}
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
                  onRefetch={() => { refetch(); }}
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
                    onRefetch={refetch}
                  />
                )}
              </VStack>
            ))}
          </VStack>
        )
      ) : (
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="rocket-outline" size={40} color="#9CA3AF" />
          <Heading size="sm" className="text-typo-500 mt-3">No quests found</Heading>
          <UIText size="sm" className="text-typo-400 mt-1">Try a different search or filter</UIText>
        </Card>
      )}
    </VStack>
  );
}

// ── Organizations Tab ──

// ── Org Management View ──

function OrgManageView({ orgId, onBack }: { orgId: string; onBack: () => void }) {
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
        <UIText className="text-typo-500">Organization not found.</UIText>
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
        <Pressable onPress={onBack} className="w-9 h-9 rounded-lg bg-surface-100 items-center justify-center active:bg-surface-200">
          <Ionicons name="arrow-back" size={18} color="#6B7280" />
        </Pressable>
        <VStack className="flex-1">
          <Heading size="lg">{org.name}</Heading>
          <UIText size="xs" className="text-typo-400">/{org.slug}</UIText>
        </VStack>
        <Badge action={org.is_active ? 'success' : 'error'}>
          <BadgeText className={org.is_active ? 'text-green-700' : 'text-red-700'}>
            {org.is_active ? 'Active' : 'Inactive'}
          </BadgeText>
        </Badge>
      </HStack>

      {/* Sub-tabs */}
      <HStack className="bg-surface-100 rounded-lg p-1" space="xs">
        {orgTabs.map((t) => (
          <Pressable key={t.key} onPress={() => setOrgTab(t.key)} className={`flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-md ${orgTab === t.key ? 'bg-white shadow-sm' : ''}`}>
            <Ionicons name={t.icon} size={14} color={orgTab === t.key ? '#6D469B' : '#9CA3AF'} />
            <UIText size="xs" className={orgTab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500'}>{t.label}</UIText>
          </Pressable>
        ))}
      </HStack>

      {/* Settings tab */}
      {orgTab === 'settings' && (
        <VStack space="md">
          <Card variant="elevated" size="md">
            <VStack space="sm">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Organization Name</UIText>
              <Input><InputField value={editName} onChangeText={setEditName} /></Input>
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Slug</UIText>
              <Input><InputField value={editSlug} onChangeText={(t) => setEditSlug(t.toLowerCase().replace(/[^a-z0-9-]/g, '-'))} /></Input>
              <Button onPress={handleSaveSettings} loading={saving} disabled={!editName.trim() || !editSlug.trim()}>
                <ButtonText>Save</ButtonText>
              </Button>
            </VStack>
          </Card>

          <Card variant="elevated" size="md">
            <VStack space="sm">
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Quest Visibility Policy</UIText>
              <View className="flex flex-row flex-wrap gap-2">
                {['all_optio', 'curated', 'private_only'].map((p) => (
                  <Pressable key={p} onPress={() => handleSetPolicy(p)}>
                    <View className={`px-4 py-2.5 rounded-lg ${org.quest_visibility_policy === p ? 'bg-optio-purple' : 'bg-surface-100 active:bg-surface-200'}`}>
                      <UIText size="xs" className={`font-poppins-medium capitalize ${org.quest_visibility_policy === p ? 'text-white' : 'text-typo-500'}`}>
                        {p.replace(/_/g, ' ')}
                      </UIText>
                    </View>
                  </Pressable>
                ))}
              </View>
            </VStack>
          </Card>

          <Pressable onPress={handleToggleActive} className="flex-row items-center justify-between px-4 py-3 bg-surface-50 rounded-xl active:bg-surface-100">
            <VStack>
              <UIText size="sm" className="font-poppins-medium">Organization Status</UIText>
              <UIText size="xs" className="text-typo-400">
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
              <UIText size="xs" className="text-typo-400 font-poppins-medium">Add User by Email</UIText>
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
              <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' }}>
                <View style={{ flex: 3 }}><UIText size="xs" className="text-typo-400 font-poppins-medium">User</UIText></View>
                <View style={{ flex: 2 }}><UIText size="xs" className="text-typo-400 font-poppins-medium">Email</UIText></View>
                <View style={{ flex: 1.5 }}><UIText size="xs" className="text-typo-400 font-poppins-medium">Org Role</UIText></View>
                <View style={{ flex: 1, alignItems: 'flex-end' }}><UIText size="xs" className="text-typo-400 font-poppins-medium">Actions</UIText></View>
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
                        <UIText size="xs" className="text-typo-400" numberOfLines={1}>{u.email}</UIText>
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
              <Ionicons name="people-outline" size={36} color="#9CA3AF" />
              <UIText size="sm" className="text-typo-500 mt-2">No users in this organization</UIText>
            </Card>
          )}
        </VStack>
      )}

      {/* Content tab */}
      {orgTab === 'content' && (
        <VStack space="md">
          <Card variant="filled" size="md">
            <VStack space="sm" className="items-center py-4">
              <Ionicons name="library-outline" size={36} color="#9CA3AF" />
              <UIText size="sm" className="text-typo-500">Content management coming soon</UIText>
              <UIText size="xs" className="text-typo-400 text-center">
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
                    <UIText size="xs" className="text-typo-400">/{org.slug}</UIText>
                    <HStack className="items-center gap-2 mt-1">
                      <Badge action={org.is_active ? 'success' : 'error'}>
                        <BadgeText className={org.is_active ? 'text-green-700' : 'text-red-700'}>
                          {org.is_active ? 'Active' : 'Inactive'}
                        </BadgeText>
                      </Badge>
                      <Badge action="muted">
                        <BadgeText className="text-typo-500 capitalize">{org.quest_visibility_policy?.replace(/_/g, ' ') || 'all'}</BadgeText>
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
          <Ionicons name="business-outline" size={40} color="#9CA3AF" />
          <Heading size="sm" className="text-typo-500 mt-3">No organizations</Heading>
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
      <UIText size="sm" className="text-typo-500">Automated system emails (read-only reference)</UIText>
      {automatedEmails.map((e, i) => (
        <Card key={i} variant="outline" size="sm">
          <HStack className="items-center justify-between">
            <VStack>
              <UIText size="sm" className="font-poppins-medium">{e.name}</UIText>
              <UIText size="xs" className="text-typo-400">{e.trigger}</UIText>
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
      <UIText size="sm" className="text-typo-500">
        Generate multiple courses at once from a list of topics. One topic per line.
      </UIText>

      <Card variant="outline" size="md">
        <VStack space="sm">
          <UIText size="xs" className="text-typo-400 font-poppins-medium">Topics (one per line)</UIText>
          <TextInput
            className="border border-surface-200 rounded-lg p-3 text-sm min-h-[160px] font-poppins"
            placeholder={"Introduction to Photography\nBasic Web Development\nCreative Writing Workshop"}
            value={topics}
            onChangeText={setTopics}
            multiline
            textAlignVertical="top"
            placeholderTextColor="#9CA3AF"
          />
          <HStack className="items-center justify-between">
            <UIText size="xs" className="text-typo-400">
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
                  <UIText size="xs" className="text-typo-400 capitalize">{job.status || 'pending'}</UIText>
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
        <HStack className="bg-surface-100 rounded-lg p-1" space="xs">
          <Pressable onPress={() => setActiveView('categories')}>
            <View className={`px-4 py-2 rounded-md ${activeView === 'categories' ? 'bg-white shadow-sm' : ''}`}>
              <UIText size="sm" className={activeView === 'categories' ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500'}>
                Categories ({categories.length})
              </UIText>
            </View>
          </Pressable>
          <Pressable onPress={() => setActiveView('articles')}>
            <View className={`px-4 py-2 rounded-md ${activeView === 'articles' ? 'bg-white shadow-sm' : ''}`}>
              <UIText size="sm" className={activeView === 'articles' ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500'}>
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
                    <UIText size="xs" className="text-typo-400">{cat.slug || ''} - {cat.article_count || 0} articles</UIText>
                  </VStack>
                  <HStack className="gap-2">
                    <Pressable className="w-8 h-8 rounded-lg bg-surface-100 items-center justify-center">
                      <Ionicons name="create-outline" size={16} color="#6B7280" />
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
            <Ionicons name="folder-outline" size={40} color="#9CA3AF" />
            <Heading size="sm" className="text-typo-500 mt-3">No categories</Heading>
            <UIText size="sm" className="text-typo-400 mt-1">Create a category to organize help articles</UIText>
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
                    <UIText size="xs" className="text-typo-400">{art.category_name || 'Uncategorized'} - {art.status || 'draft'}</UIText>
                  </VStack>
                  <HStack className="gap-2">
                    <Badge action={art.status === 'published' ? 'success' : 'muted'}>
                      <BadgeText className={art.status === 'published' ? 'text-green-700' : 'text-typo-500'}>
                        {art.status || 'draft'}
                      </BadgeText>
                    </Badge>
                    <Pressable className="w-8 h-8 rounded-lg bg-surface-100 items-center justify-center">
                      <Ionicons name="create-outline" size={16} color="#6B7280" />
                    </Pressable>
                  </HStack>
                </HStack>
              </Card>
            ))}
          </VStack>
        ) : (
          <Card variant="filled" size="lg" className="items-center py-10">
            <Ionicons name="document-text-outline" size={40} color="#9CA3AF" />
            <Heading size="sm" className="text-typo-500 mt-3">No articles</Heading>
            <UIText size="sm" className="text-typo-400 mt-1">Create help articles for your users</UIText>
          </Card>
        )
      )}
    </VStack>
  );
}

// ── Main Admin Page ──

export default function AdminScreen() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<AdminTab>('users');

  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <Ionicons name="desktop-outline" size={40} color="#9CA3AF" />
        <Heading size="sm" className="text-typo-500 mt-3">Desktop Only</Heading>
        <UIText size="sm" className="text-typo-400 mt-1">Admin tools are available on desktop.</UIText>
      </SafeAreaView>
    );
  }

  // Role check
  const role = user?.role;
  if (role !== 'superadmin' && role !== 'org_managed') {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <Ionicons name="lock-closed-outline" size={40} color="#9CA3AF" />
        <Heading size="sm" className="text-typo-500 mt-3">Access Denied</Heading>
        <UIText size="sm" className="text-typo-400 mt-1">Admin access required.</UIText>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" contentContainerClassName="px-5 md:px-8 pt-6 pb-12" showsVerticalScrollIndicator={false}>
        <VStack space="lg" className="max-w-6xl w-full md:mx-auto">

          <Heading size="2xl">Admin Panel</Heading>

          {/* Tabs */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <HStack className="bg-surface-100 rounded-xl p-1" space="xs">
              {tabs.map((t) => (
                <Pressable key={t.key} onPress={() => setActiveTab(t.key)}>
                  <HStack className={`items-center gap-2 px-4 py-2.5 rounded-lg ${activeTab === t.key ? 'bg-white shadow-sm' : ''}`}>
                    <Ionicons name={t.icon} size={16} color={activeTab === t.key ? '#6D469B' : '#9CA3AF'} />
                    <UIText size="sm" className={activeTab === t.key ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500'}>
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
