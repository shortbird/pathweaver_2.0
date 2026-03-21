/**
 * Admin Panel - Web only. Superadmin/org_admin access.
 *
 * Tabs: Users, Quests, Organizations, Courses, Flagged Tasks, Emails
 */

import React, { useState } from 'react';
import { View, ScrollView, Pressable, Platform, TextInput, Alert } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useAuthStore } from '@/src/stores/authStore';
import { useAdminUsers, useAdminQuests, useAdminOrganizations, useFlaggedTasks } from '@/src/hooks/useAdmin';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Divider, Skeleton, Input, InputField, InputSlot, InputIcon,
  Avatar, AvatarFallbackText,
} from '@/src/components/ui';

type AdminTab = 'users' | 'quests' | 'orgs' | 'flagged' | 'emails';

const tabs: { key: AdminTab; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'users', label: 'Users', icon: 'people-outline' },
  { key: 'quests', label: 'Quests', icon: 'rocket-outline' },
  { key: 'orgs', label: 'Organizations', icon: 'business-outline' },
  { key: 'flagged', label: 'Flagged', icon: 'flag-outline' },
  { key: 'emails', label: 'Emails', icon: 'mail-outline' },
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

function UsersPanel() {
  const {
    users, total, loading, page, setPage, search, setSearch,
    roleFilter, setRoleFilter, perPage, totalPages, deleteUser, masquerade,
  } = useAdminUsers();

  const roles = ['student', 'parent', 'advisor', 'observer', 'org_admin', 'org_managed', 'superadmin'];

  return (
    <VStack space="md">
      {/* Search + filter */}
      <HStack className="gap-3 flex-wrap">
        <View className="flex-1 min-w-[200px]">
          <Input variant="rounded">
            <InputSlot className="ml-3"><InputIcon as="search-outline" /></InputSlot>
            <InputField placeholder="Search by name or email..." value={search} onChangeText={setSearch} />
          </Input>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-shrink-0">
          <HStack space="xs">
            <Pressable onPress={() => setRoleFilter(null)}>
              <View className={`px-3 py-1.5 rounded-full ${!roleFilter ? 'bg-optio-purple' : 'bg-surface-200'}`}>
                <UIText size="xs" className={`font-poppins-medium ${!roleFilter ? 'text-white' : 'text-typo-500'}`}>All ({total})</UIText>
              </View>
            </Pressable>
            {roles.map((r) => (
              <Pressable key={r} onPress={() => setRoleFilter(r)}>
                <View className={`px-3 py-1.5 rounded-full ${roleFilter === r ? 'bg-optio-purple' : 'bg-surface-200'}`}>
                  <UIText size="xs" className={`font-poppins-medium capitalize ${roleFilter === r ? 'text-white' : 'text-typo-500'}`}>
                    {r === 'org_managed' ? 'Org Managed' : r}
                  </UIText>
                </View>
              </Pressable>
            ))}
          </HStack>
        </ScrollView>
      </HStack>

      {/* User list */}
      {loading ? (
        <VStack space="sm">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</VStack>
      ) : (
        <VStack space="xs">
          {/* Header row */}
          <HStack className="px-4 py-2">
            <UIText size="xs" className="text-typo-400 font-poppins-medium w-1/4">User</UIText>
            <UIText size="xs" className="text-typo-400 font-poppins-medium w-1/4">Email</UIText>
            <UIText size="xs" className="text-typo-400 font-poppins-medium w-1/6">Role</UIText>
            <UIText size="xs" className="text-typo-400 font-poppins-medium w-1/6">XP</UIText>
            <UIText size="xs" className="text-typo-400 font-poppins-medium w-1/6">Actions</UIText>
          </HStack>
          <Divider />

          {users.map((u) => {
            const initials = `${u.first_name?.[0] || ''}${u.last_name?.[0] || ''}`.toUpperCase();
            const effectiveRole = u.role === 'org_managed' ? (u.org_role || 'org_managed') : u.role;
            const rColor = roleColors[effectiveRole] || roleColors.student;

            return (
              <Pressable key={u.id} className="active:bg-surface-50">
                <HStack className="px-4 py-3 items-center">
                  <HStack className="w-1/4 items-center gap-2">
                    <Avatar size="sm">
                      <AvatarFallbackText>{initials}</AvatarFallbackText>
                    </Avatar>
                    <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                      {u.display_name || `${u.first_name} ${u.last_name}`}
                    </UIText>
                  </HStack>
                  <UIText size="xs" className="text-typo-500 w-1/4" numberOfLines={1}>{u.email}</UIText>
                  <View className="w-1/6">
                    <View className={`self-start px-2 py-0.5 rounded-full ${rColor.split(' ')[0]}`}>
                      <UIText size="xs" className={`font-poppins-medium capitalize ${rColor.split(' ')[1]}`}>
                        {effectiveRole === 'org_managed' ? 'Org' : effectiveRole}
                      </UIText>
                    </View>
                  </View>
                  <UIText size="xs" className="text-typo-500 w-1/6">{(u.total_xp || 0).toLocaleString()}</UIText>
                  <HStack className="w-1/6 gap-2">
                    <Pressable
                      onPress={() => masquerade(u.id)}
                      className="w-8 h-8 rounded-lg bg-surface-100 items-center justify-center active:bg-surface-200"
                    >
                      <Ionicons name="eye-outline" size={16} color="#6B7280" />
                    </Pressable>
                    <Pressable
                      onPress={() => { if (confirm(`Delete ${u.email}?`)) deleteUser(u.id); }}
                      className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center active:bg-red-100"
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </HStack>
                </HStack>
                <Divider />
              </Pressable>
            );
          })}
        </VStack>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <HStack className="items-center justify-center gap-2">
          <Button size="xs" variant="outline" disabled={page <= 1} onPress={() => setPage(page - 1)}>
            <ButtonText>Previous</ButtonText>
          </Button>
          <UIText size="sm" className="text-typo-500">Page {page} of {totalPages}</UIText>
          <Button size="xs" variant="outline" disabled={page >= totalPages} onPress={() => setPage(page + 1)}>
            <ButtonText>Next</ButtonText>
          </Button>
        </HStack>
      )}
    </VStack>
  );
}

// ── Quests Tab ──

function QuestsPanel() {
  const { quests, loading, search, setSearch, deleteQuest } = useAdminQuests();

  return (
    <VStack space="md">
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

      {loading ? (
        <VStack space="sm">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</VStack>
      ) : quests.length > 0 ? (
        <VStack space="xs">
          <HStack className="px-4 py-2">
            <UIText size="xs" className="text-typo-400 font-poppins-medium w-2/5">Title</UIText>
            <UIText size="xs" className="text-typo-400 font-poppins-medium w-1/5">Type</UIText>
            <UIText size="xs" className="text-typo-400 font-poppins-medium w-1/5">Status</UIText>
            <UIText size="xs" className="text-typo-400 font-poppins-medium w-1/5">Actions</UIText>
          </HStack>
          <Divider />
          {quests.map((q: any) => (
            <React.Fragment key={q.id}>
              <Pressable onPress={() => router.push(`/(app)/quests/${q.id}` as any)} className="active:bg-surface-50">
                <HStack className="px-4 py-3 items-center">
                  <UIText size="sm" className="font-poppins-medium w-2/5" numberOfLines={1}>{q.title}</UIText>
                  <View className="w-1/5">
                    <Badge action="muted"><BadgeText className="text-typo-500 capitalize">{q.quest_type || 'optio'}</BadgeText></Badge>
                  </View>
                  <View className="w-1/5">
                    <Badge action={q.is_active ? 'success' : 'error'}>
                      <BadgeText className={q.is_active ? 'text-green-700' : 'text-red-700'}>
                        {q.is_active ? 'Active' : 'Inactive'}
                      </BadgeText>
                    </Badge>
                  </View>
                  <HStack className="w-1/5 gap-2">
                    <Pressable
                      onPress={(e) => { e.stopPropagation(); if (confirm(`Delete "${q.title}"?`)) deleteQuest(q.id); }}
                      className="w-8 h-8 rounded-lg bg-red-50 items-center justify-center active:bg-red-100"
                    >
                      <Ionicons name="trash-outline" size={16} color="#EF4444" />
                    </Pressable>
                  </HStack>
                </HStack>
              </Pressable>
              <Divider />
            </React.Fragment>
          ))}
        </VStack>
      ) : (
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="rocket-outline" size={40} color="#9CA3AF" />
          <Heading size="sm" className="text-typo-500 mt-3">No quests</Heading>
        </Card>
      )}
    </VStack>
  );
}

// ── Organizations Tab ──

function OrganizationsPanel() {
  const { orgs, loading, createOrg, deleteOrg } = useAdminOrganizations();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSlug, setNewSlug] = useState('');

  const handleCreate = async () => {
    if (!newName.trim() || !newSlug.trim()) return;
    await createOrg({ name: newName.trim(), slug: newSlug.trim() });
    setNewName('');
    setNewSlug('');
    setShowCreate(false);
  };

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
                        <BadgeText className="text-typo-500 capitalize">{org.quest_visibility_policy?.replace('_', ' ') || 'all'}</BadgeText>
                      </Badge>
                    </HStack>
                  </VStack>
                  <HStack className="gap-2">
                    <Button size="xs" variant="outline">
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

// ── Flagged Tasks Tab ──

function FlaggedPanel() {
  const { tasks, loading, approveTask, deleteTask } = useFlaggedTasks();

  return (
    <VStack space="md">
      {loading ? (
        <VStack space="sm">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</VStack>
      ) : tasks.length > 0 ? (
        <VStack space="sm">
          {tasks.map((t: any) => (
            <Card key={t.id} variant="outline" size="md">
              <HStack className="items-center justify-between">
                <VStack className="flex-1 min-w-0">
                  <UIText size="sm" className="font-poppins-medium">{t.title}</UIText>
                  <UIText size="xs" className="text-typo-400">
                    {t.flag_count || 1} flag{(t.flag_count || 1) !== 1 ? 's' : ''} - {t.user_email || 'Unknown user'}
                  </UIText>
                </VStack>
                <HStack className="gap-2">
                  <Button size="xs" action="positive" onPress={() => approveTask(t.id)}>
                    <ButtonText>Approve</ButtonText>
                  </Button>
                  <Button size="xs" action="negative" variant="outline" onPress={() => { if (confirm('Delete this task?')) deleteTask(t.id); }}>
                    <ButtonText>Delete</ButtonText>
                  </Button>
                </HStack>
              </HStack>
            </Card>
          ))}
        </VStack>
      ) : (
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="checkmark-circle-outline" size={40} color="#16A34A" />
          <Heading size="sm" className="text-typo-500 mt-3">No flagged tasks</Heading>
          <UIText size="sm" className="text-typo-400 mt-1">All content is clean</UIText>
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
          {activeTab === 'flagged' && <FlaggedPanel />}
          {activeTab === 'emails' && <EmailsPanel />}

        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
