/**
 * Parent Dashboard - View and monitor linked children's learning.
 *
 * Desktop: child tabs + full overview with engagement calendar.
 * Mobile: child selector dropdown + scrollable overview.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Platform, useWindowDimensions, Image, RefreshControl, Alert, TextInput, Modal, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMyChildren, useChildDashboard, useChildEngagement } from '@/src/hooks/useParent';
import { useFeed } from '@/src/hooks/useFeed';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { PillarBadge } from '@/src/components/ui/pillar-badge';
import { CaptureSheet } from '@/src/components/capture/CaptureSheet';
import * as ImagePicker from 'expo-image-picker';
import api from '@/src/services/api';
import { useActingAsStore } from '@/src/stores/actingAsStore';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Divider, Avatar, AvatarFallbackText, AvatarImage, Skeleton,
  Badge, BadgeText,
} from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';

const DESKTOP_BREAKPOINT = 768;

// ── Child Selector (tabs on desktop, horizontal scroll on mobile) ──

function ChildSelector({ children, selectedId, onSelect }: {
  children: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (children.length <= 1) return null;

  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 4 }}>
      {children.map((child: any) => {
        const active = child.id === selectedId;
        const initials = `${child.first_name?.[0] || ''}${child.last_name?.[0] || ''}`.toUpperCase();
        return (
          <Pressable
            key={child.id}
            onPress={() => onSelect(child.id)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 10,
              borderRadius: 12,
              backgroundColor: active ? '#6D469B' : '#F3F4F6',
            }}
          >
            <Avatar size="xs" className={active ? 'border border-white' : ''}>
              {child.avatar_url ? (
                <AvatarImage source={{ uri: child.avatar_url }} />
              ) : (
                <AvatarFallbackText>{initials}</AvatarFallbackText>
              )}
            </Avatar>
            <UIText size="sm" style={{ color: active ? '#fff' : '#6B7280', fontFamily: active ? 'Poppins_600SemiBold' : 'Poppins_500Medium' }}>
              {child.first_name}
            </UIText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ── Child Hero Card ──

function ChildHero({ child, stats, rhythm }: { child: any; stats: any; rhythm: any }) {
  const initials = `${child.first_name?.[0] || ''}${child.last_name?.[0] || ''}`.toUpperCase();

  return (
    <Card variant="elevated" size="lg">
      <HStack className="items-center gap-4">
        <Avatar size="xl">
          {child.avatar_url ? (
            <AvatarImage source={{ uri: child.avatar_url }} />
          ) : (
            <AvatarFallbackText>{initials}</AvatarFallbackText>
          )}
        </Avatar>
        <VStack className="flex-1 min-w-0">
          <Heading size="xl" numberOfLines={1}>{child.display_name || `${child.first_name} ${child.last_name}`}</Heading>
          {rhythm && <RhythmBadge rhythm={rhythm} compact />}
        </VStack>
      </HStack>

      <Divider className="my-4" />

      <HStack className="justify-around">
        <VStack className="items-center">
          <UIText size="lg" className="font-poppins-bold text-optio-purple">
            {(stats?.total_xp || child.total_xp || 0).toLocaleString()}
          </UIText>
          <UIText size="xs" className="text-typo-400">Total XP</UIText>
        </VStack>
        <VStack className="items-center">
          <UIText size="lg" className="font-poppins-bold text-optio-pink">
            {stats?.active_quests_count || 0}
          </UIText>
          <UIText size="xs" className="text-typo-400">Active Quests</UIText>
        </VStack>
        <VStack className="items-center">
          <UIText size="lg" className="font-poppins-bold" style={{ color: '#3DA24A' }}>
            {stats?.completed_quests_count || 0}
          </UIText>
          <UIText size="xs" className="text-typo-400">Completed</UIText>
        </VStack>
      </HStack>
    </Card>
  );
}

// ── Active Quests List ──

function QuestsList({ quests, label }: { quests: any[]; label: string }) {
  if (!quests || quests.length === 0) return null;

  return (
    <VStack space="sm">
      <Heading size="md">{label}</Heading>
      {quests.map((q: any) => {
        const quest = q.quests || q;
        return (
          <Card key={q.quest_id || q.id || quest.id} variant="outline" size="md">
            <HStack className="items-center gap-3">
              {quest.image_url ? (
                <Image
                  source={{ uri: quest.image_url }}
                  style={{ width: 48, height: 48, borderRadius: 10 }}
                  resizeMode="cover"
                />
              ) : (
                <View style={{ width: 48, height: 48, borderRadius: 10, backgroundColor: '#6D469B15', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name="rocket-outline" size={22} color="#6D469B" />
                </View>
              )}
              <VStack className="flex-1 min-w-0">
                <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>{quest.title}</UIText>
                <UIText size="xs" className="text-typo-400" numberOfLines={1}>{quest.description || quest.big_idea || ''}</UIText>
              </VStack>
            </HStack>
          </Card>
        );
      })}
    </VStack>
  );
}

// ── Main Page ──

export default function ParentDashboardPage() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  const { children, loading: childrenLoading } = useMyChildren();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Auto-select first child
  useEffect(() => {
    if (children.length > 0 && !selectedId) {
      setSelectedId(children[0].id);
    }
  }, [children, selectedId]);

  const selectedChild = children.find((c) => c.id === selectedId) || null;
  const { data: dashboard, loading: dashboardLoading, refetch } = useChildDashboard(selectedId);
  const { data: engagement } = useChildEngagement(selectedId);
  const { items: feedItems, loading: feedLoading } = useFeed({ studentId: selectedId || undefined });

  // ── Parent action state ──
  const [captureVisible, setCaptureVisible] = useState(false);
  const [captureStudentIds, setCaptureStudentIds] = useState<string[]>([]);
  const [inviteObserverVisible, setInviteObserverVisible] = useState(false);
  const [observerEmail, setObserverEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const isUnder13 = useMemo(() => {
    if (!selectedChild?.date_of_birth) return false;
    const now = new Date();
    const cutoff = new Date(now.getFullYear() - 13, now.getMonth(), now.getDate());
    return new Date(selectedChild.date_of_birth) > cutoff;
  }, [selectedChild]);

  const handleCaptureForChild = () => {
    if (!selectedId) return;
    setCaptureStudentIds([selectedId]);
    setCaptureVisible(true);
  };

  const handleCaptureForAll = () => {
    setCaptureStudentIds(children.map((c) => c.id));
    setCaptureVisible(true);
  };

  const handleInviteObserver = async () => {
    if (!observerEmail.trim() || !selectedId) return;
    setInviting(true);
    try {
      await api.post('/api/observers/invite', {
        student_id: selectedId,
        observer_email: observerEmail.trim(),
      });
      Alert.alert('Sent', `Invitation sent to ${observerEmail.trim()}`);
      setObserverEmail('');
      setInviteObserverVisible(false);
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to send invitation';
      Alert.alert('Error', msg);
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveObserver = (observerId: string, name: string) => {
    Alert.alert('Remove Observer', `Remove ${name} as an observer?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/observers/${observerId}`);
            Alert.alert('Removed', `${name} has been removed.`);
          } catch {
            Alert.alert('Error', 'Failed to remove observer');
          }
        },
      },
    ]);
  };

  const handleToggleAI = async () => {
    if (!selectedId) return;
    const current = (selectedChild as any)?.ai_enabled !== false;
    try {
      await api.put(`/api/dependents/${selectedId}/settings`, { ai_enabled: !current });
      Alert.alert('Updated', `AI features ${!current ? 'enabled' : 'disabled'}.`);
      refetch();
    } catch {
      Alert.alert('Error', 'Failed to update settings');
    }
  };

  const handleViewAsChild = async () => {
    if (!selectedChild) return;
    try {
      // startActingAs swaps tokens and triggers a full page reload
      await useActingAsStore.getState().startActingAs({
        id: selectedChild.id,
        display_name: selectedChild.display_name,
        first_name: selectedChild.first_name,
        last_name: selectedChild.last_name,
        avatar_url: selectedChild.avatar_url,
      });
    } catch (err: any) {
      Alert.alert('Error', err.response?.data?.error || 'Failed to switch to child view');
    }
  };

  const handleUploadAvatar = async () => {
    if (!selectedId) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    const formData = new FormData();
    formData.append('avatar', {
      uri: asset.uri,
      name: asset.fileName || 'avatar.jpg',
      type: 'image/jpeg',
    } as any);
    try {
      await api.put(`/api/users/${selectedId}/profile`, formData);
      Alert.alert('Updated', 'Profile picture updated.');
      refetch();
    } catch {
      Alert.alert('Error', 'Failed to upload picture');
    }
  };

  const handlePromote = () => {
    if (!selectedId || !selectedChild) return;
    Alert.prompt
      ? Alert.prompt('Give Login Access', `Enter an email for ${selectedChild.first_name}:`, [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Create Login', onPress: async (email) => {
              if (!email?.trim()) return;
              try {
                await api.post(`/api/dependents/${selectedId}/promote`, {
                  email: email.trim(),
                  password: 'TempPass123!',
                });
                Alert.alert('Success', `Login created for ${selectedChild.first_name}. They can sign in with ${email.trim()}.`);
              } catch (err: any) {
                Alert.alert('Error', err.response?.data?.error || 'Failed to create login');
              }
            },
          },
        ])
      : // Fallback for Android (no Alert.prompt)
        Alert.alert(
          'Give Login Access',
          `This will create a login for ${selectedChild.first_name}. Contact support to set their email.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Create Login', onPress: async () => {
                try {
                  await api.post(`/api/dependents/${selectedId}/promote`, {
                    email: `${selectedChild.first_name.toLowerCase()}@family.optio.com`,
                    password: 'TempPass123!',
                  });
                  Alert.alert('Success', `Login created for ${selectedChild.first_name}.`);
                } catch (err: any) {
                  Alert.alert('Error', err.response?.data?.error || 'Failed to create login');
                }
              },
            },
          ],
        );
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // Loading
  if (childrenLoading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <ActivityIndicator size="large" color="#6D469B" />
      </SafeAreaView>
    );
  }

  // No children
  if (children.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="people-outline" size={56} color="#9CA3AF" />
          <Heading size="lg" className="text-typo-500 mt-4 text-center">No students linked</Heading>
          <UIText size="sm" className="text-typo-400 mt-2 text-center">
            Add a dependent or connect with a student to view their learning dashboard.
          </UIText>
          <Button size="lg" className="mt-6">
            <ButtonText>Add a Child</ButtonText>
          </Button>
        </View>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6D469B" />}
      >
        <PageHeader title="Family" />
        <VStack className="max-w-5xl w-full md:mx-auto px-5 md:px-8" space="lg">

          {/* Child selector */}
          <ChildSelector children={children} selectedId={selectedId} onSelect={setSelectedId} />

          {/* Loading child data */}
          {dashboardLoading && !dashboard ? (
            <VStack space="md">
              <Skeleton className="h-36 rounded-2xl" />
              <Skeleton className="h-48 rounded-xl" />
              <Skeleton className="h-32 rounded-xl" />
            </VStack>
          ) : selectedChild ? (
            <>
              {/* Hero card */}
              <ChildHero
                child={selectedChild}
                stats={dashboard?.stats}
                rhythm={engagement?.rhythm}
              />

              {/* Quick actions */}
              <VStack space="sm">
                <Heading size="md">Actions</Heading>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
                  <Pressable onPress={handleCaptureForChild} className="items-center py-3 px-4 bg-surface-50 rounded-xl">
                    <Ionicons name="camera-outline" size={22} color="#6D469B" />
                    <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Capture</UIText>
                  </Pressable>
                  {children.length > 1 && (
                    <Pressable onPress={handleCaptureForAll} className="items-center py-3 px-4 bg-surface-50 rounded-xl">
                      <Ionicons name="people-outline" size={22} color="#6D469B" />
                      <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Capture All</UIText>
                    </Pressable>
                  )}
                  <Pressable onPress={handleViewAsChild} className="items-center py-3 px-4 bg-surface-50 rounded-xl">
                    <Ionicons name="eye-outline" size={22} color="#6D469B" />
                    <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">View As</UIText>
                  </Pressable>
                  <Pressable onPress={() => setInviteObserverVisible(true)} className="items-center py-3 px-4 bg-surface-50 rounded-xl">
                    <Ionicons name="person-add-outline" size={22} color="#6D469B" />
                    <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Add Observer</UIText>
                  </Pressable>
                  <Pressable onPress={handleToggleAI} className="items-center py-3 px-4 bg-surface-50 rounded-xl">
                    <Ionicons name="sparkles-outline" size={22} color="#6D469B" />
                    <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">AI Settings</UIText>
                  </Pressable>
                  <Pressable onPress={handleUploadAvatar} className="items-center py-3 px-4 bg-surface-50 rounded-xl">
                    <Ionicons name="image-outline" size={22} color="#6D469B" />
                    <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Photo</UIText>
                  </Pressable>
                  {isUnder13 && selectedChild?.is_dependent && (
                    <Pressable onPress={handlePromote} className="items-center py-3 px-4 bg-surface-50 rounded-xl">
                      <Ionicons name="key-outline" size={22} color="#6D469B" />
                      <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Give Login</UIText>
                    </Pressable>
                  )}
                </ScrollView>
              </VStack>

              {/* Two-column on desktop: Engagement + Quests */}
              <View className={`${isDesktop ? 'flex flex-row gap-4' : ''}`}>
                {/* Engagement */}
                <VStack className={`${isDesktop ? 'flex-1' : ''}`} space="sm">
                  <Heading size="md">Learning Rhythm</Heading>
                  <Card variant="elevated" size="md">
                    <VStack space="md">
                      <HStack className="items-center justify-between">
                        <RhythmBadge rhythm={engagement?.rhythm || null} compact />
                        {engagement?.rhythm?.pattern_description && (
                          <UIText size="xs" className="text-typo-400">{engagement.rhythm.pattern_description}</UIText>
                        )}
                      </HStack>
                      <EngagementCalendar
                        days={engagement?.calendar?.days || []}
                        firstActivityDate={engagement?.calendar?.first_activity_date}
                      />
                    </VStack>
                  </Card>
                </VStack>

                {/* Quests */}
                <VStack className={`${isDesktop ? 'flex-1' : 'mt-4'}`} space="sm">
                  <QuestsList quests={dashboard?.active_quests || []} label="Active Quests" />
                  <QuestsList quests={dashboard?.completed_quests || []} label="Completed" />
                  {(!dashboard?.active_quests?.length && !dashboard?.completed_quests?.length) && (
                    <Card variant="filled" size="md" className="items-center py-8">
                      <Ionicons name="rocket-outline" size={32} color="#9CA3AF" />
                      <UIText size="sm" className="text-typo-400 mt-2">No quests yet</UIText>
                    </Card>
                  )}
                </VStack>
              </View>

              {/* Recent Activity Feed */}
              <VStack space="sm">
                <Heading size="md">Recent Activity</Heading>
                {feedLoading ? (
                  <VStack space="sm">
                    <Skeleton className="h-28 rounded-xl" />
                    <Skeleton className="h-28 rounded-xl" />
                  </VStack>
                ) : feedItems.length > 0 ? (
                  <VStack space="sm">
                    {feedItems.slice(0, 5).map((item: any) => (
                      <FeedCard key={item.id} item={item} showStudent={false} />
                    ))}
                    {feedItems.length > 5 && (
                      <Button variant="outline" size="sm" className="self-center">
                        <ButtonText>View All Activity</ButtonText>
                      </Button>
                    )}
                  </VStack>
                ) : (
                  <Card variant="filled" size="md" className="items-center py-8">
                    <Ionicons name="newspaper-outline" size={32} color="#9CA3AF" />
                    <UIText size="sm" className="text-typo-400 mt-2">No recent activity</UIText>
                  </Card>
                )}
              </VStack>
            </>
          ) : null}
        </VStack>
      </ScrollView>

      {/* Capture sheet */}
      <CaptureSheet
        visible={captureVisible}
        onClose={() => setCaptureVisible(false)}
        onCaptured={() => refetch()}
        studentIds={captureStudentIds}
      />

      {/* Invite Observer Modal */}
      <Modal visible={inviteObserverVisible} transparent animationType="none" onRequestClose={() => setInviteObserverVisible(false)}>
        <KeyboardAvoidingView className="flex-1 justify-end" behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Pressable className="flex-1" style={{ backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setInviteObserverVisible(false)} />
          <View style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}>
            <View className="w-10 h-1 bg-surface-300 rounded-full self-center mb-4" />
            <VStack space="md">
              <HStack className="items-center justify-between">
                <Heading size="lg">Invite Observer</Heading>
                <Pressable onPress={() => setInviteObserverVisible(false)} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                  <Ionicons name="close" size={18} color="#6B7280" />
                </Pressable>
              </HStack>
              <UIText size="sm" className="text-typo-500">
                Invite someone to observe {selectedChild?.first_name}'s learning journey.
              </UIText>
              <TextInput
                value={observerEmail}
                onChangeText={setObserverEmail}
                placeholder="Observer's email address"
                placeholderTextColor="#9CA3AF"
                keyboardType="email-address"
                autoCapitalize="none"
                className="bg-surface-50 rounded-xl p-4 text-base"
                style={{ fontFamily: 'Poppins_400Regular' }}
              />
              <Button size="lg" onPress={handleInviteObserver} loading={inviting} disabled={!observerEmail.trim() || inviting} className="w-full">
                <ButtonText>Send Invitation</ButtonText>
              </Button>
            </VStack>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}
