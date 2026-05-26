/**
 * Parent Dashboard - View and monitor linked children's learning.
 *
 * Desktop: child tabs + full overview with engagement calendar.
 * Mobile: child selector dropdown + scrollable overview.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Platform, useWindowDimensions, Image, RefreshControl, Alert, Modal, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'react-native-qrcode-svg';
import { useMyChildren, useChildDashboard, useChildEngagement } from '@/src/hooks/useParent';
import { useFeed } from '@/src/hooks/useFeed';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { PillarBadge } from '@/src/components/ui/pillar-badge';
import { CaptureSheet } from '@/src/components/capture/CaptureSheet';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import api from '@/src/services/api';
import { useActingAsStore } from '@/src/stores/actingAsStore';
import { useFerpaApprovals } from '@/src/hooks/useFerpaApprovals';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Divider, Avatar, AvatarFallbackText, AvatarImage, Skeleton,
  Badge, BadgeText, BottomSheet,
} from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';

const DESKTOP_BREAKPOINT = 768;

function calculateAge(dateOfBirth: string | null | undefined): number | null {
  if (!dateOfBirth) return null;
  const today = new Date();
  const birthDate = new Date(dateOfBirth);
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
}

// ── Child Header (horizontal avatar row, tap to switch) ──

function ChildHeader({ children, selectedId, onSelect, attentionByChildId }: {
  children: any[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  attentionByChildId?: Record<string, boolean>;
}) {
  const selected = children.find((c) => c.id === selectedId);
  if (!selected) return null;
  // Single-kid families don't need the switcher.
  if (children.length < 2) return null;

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingVertical: 6, gap: 14 }}
      >
        {children.map((child) => {
          const isSelected = child.id === selectedId;
          const needsAttention = attentionByChildId?.[child.id] === true;
          const childInitials = `${child.first_name?.[0] || ''}${child.last_name?.[0] || ''}`.toUpperCase();
          return (
            <Pressable
              key={child.id}
              onPress={() => onSelect(child.id)}
              style={{ alignItems: 'center', width: 64 }}
            >
              <View
                style={{
                  padding: 2,
                  borderRadius: 999,
                  borderWidth: 2,
                  borderColor: isSelected ? '#6D469B' : 'transparent',
                }}
              >
                <Avatar size="md">
                  {child.avatar_url ? (
                    <AvatarImage source={{ uri: child.avatar_url }} />
                  ) : (
                    <AvatarFallbackText>{childInitials}</AvatarFallbackText>
                  )}
                </Avatar>
                {needsAttention && (
                  <View
                    style={{
                      position: 'absolute', top: 0, right: 0,
                      width: 12, height: 12, borderRadius: 6,
                      backgroundColor: '#EF597B',
                      borderWidth: 2, borderColor: '#FFFFFF',
                    }}
                  />
                )}
              </View>
              <UIText
                size="xs"
                style={{
                  marginTop: 4,
                  color: isSelected ? '#6D469B' : '#1F2937',
                  fontFamily: isSelected ? 'Poppins_600SemiBold' : 'Poppins_500Medium',
                }}
                numberOfLines={1}
              >
                {child.first_name}
              </UIText>
            </Pressable>
          );
        })}
      </ScrollView>
    </>
  );
}

// ── Child Hero Card ──

function ChildHero({ child, stats, onOpenSettings }: { child: any; stats: any; onOpenSettings: () => void }) {
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
        </VStack>
        <Pressable
          onPress={onOpenSettings}
          style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' }}
          hitSlop={8}
        >
          <Ionicons name="ellipsis-vertical" size={20} color="#6B6280" />
        </Pressable>
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

  // Auto-select first child. Also reset if the current selectedId no longer
  // matches any child — happens after a masquerade swap when the kids list
  // changes under us, otherwise selectedChild stays null and the page hangs.
  useEffect(() => {
    if (children.length === 0) return;
    const stillValid = !!selectedId && children.some((c) => c.id === selectedId);
    if (!stillValid) {
      setSelectedId(children[0].id);
    }
  }, [children, selectedId]);

  const selectedChild = children.find((c) => c.id === selectedId) || null;
  const { data: dashboard, loading: dashboardLoading, refetch } = useChildDashboard(selectedId);
  const { data: engagement } = useChildEngagement(selectedId);
  const { items: feedItems, loading: feedLoading } = useFeed({ studentId: selectedId || undefined });
  const { count: ferpaCount } = useFerpaApprovals();

  // ── Parent action state ──
  const [captureVisible, setCaptureVisible] = useState(false);
  const [captureStudentIds, setCaptureStudentIds] = useState<string[]>([]);
  const [inviting, setInviting] = useState(false);
  const [inviteFlowOpen, setInviteFlowOpen] = useState(false);
  const [selectedChildrenForInvite, setSelectedChildrenForInvite] = useState<string[]>([]);
  const [generatedInvite, setGeneratedInvite] = useState<{ link: string; expiresAt: string } | null>(null);
  const [qrVisible, setQrVisible] = useState(false);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [observersList, setObserversList] = useState<any[]>([]);
  const [observersLoading, setObserversLoading] = useState(false);

  const fetchObservers = useCallback(async () => {
    if (!selectedId) return;
    setObserversLoading(true);
    try {
      const { data } = await api.get('/api/observers/family-observers');
      const filtered = (data?.observers || []).filter((obs: any) =>
        (obs.children || []).some((c: any) => c.student_id === selectedId && c.enabled),
      );
      setObserversList(filtered);
    } catch {
      setObserversList([]);
    } finally {
      setObserversLoading(false);
    }
  }, [selectedId]);

  const fetchPendingInvites = useCallback(async () => {
    if (!selectedId) return;
    setPendingLoading(true);
    try {
      const { data } = await api.get('/api/observers/family-pending-invites');
      const filtered = (data?.invites || []).filter((inv: any) =>
        (inv.children || []).some((c: any) => c.id === selectedId),
      );
      setPendingInvites(filtered);
    } catch {
      setPendingInvites([]);
    } finally {
      setPendingLoading(false);
    }
  }, [selectedId]);

  const revokePendingInvite = (invitationId: string) => {
    Alert.alert('Revoke invitation', 'This link will stop working immediately.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Revoke', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/observers/family-pending-invites/${invitationId}`);
            fetchPendingInvites();
          } catch {
            Alert.alert('Error', 'Failed to revoke invitation');
          }
        },
      },
    ]);
  };

  const sharePendingInvite = async (link: string, kids: any[]) => {
    const names = kids.map((k) => k.name).join(' & ') || 'this student';
    await Share.share({ message: `Follow ${names}'s learning journey on Optio: ${link}`, url: link });
  };

  useEffect(() => {
    fetchObservers();
    fetchPendingInvites();
  }, [fetchObservers, fetchPendingInvites]);

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

  const openInviteFlow = () => {
    setSelectedChildrenForInvite(selectedId ? [selectedId] : []);
    setGeneratedInvite(null);
    setInviteFlowOpen(true);
  };

  const toggleChildForInvite = (childId: string) => {
    setSelectedChildrenForInvite((prev) =>
      prev.includes(childId) ? prev.filter((id) => id !== childId) : [...prev, childId]
    );
  };

  const generateInviteLink = async () => {
    if (selectedChildrenForInvite.length === 0) return;
    setInviting(true);
    try {
      const { data } = await api.post('/api/observers/family-invite', {
        student_ids: selectedChildrenForInvite,
      });
      const link = data?.shareable_link;
      if (!link) throw new Error('No link returned');
      setGeneratedInvite({ link, expiresAt: data?.expires_at });
      fetchPendingInvites();
    } catch (err: any) {
      const msg = err.response?.data?.error || 'Failed to create invitation link';
      Alert.alert('Error', msg);
    } finally {
      setInviting(false);
    }
  };

  const shareInviteLink = async () => {
    if (!generatedInvite?.link) return;
    const names = selectedChildrenForInvite
      .map((id) => children.find((c) => c.id === id)?.first_name || 'child')
      .join(' & ');
    await Share.share({
      message: `Follow ${names}'s learning journey on Optio: ${generatedInvite.link}`,
      url: generatedInvite.link,
    });
  };

  const handleRemoveObserver = (observerId: string, name: string) => {
    Alert.alert('Remove Observer', `Remove ${name} as an observer?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: async () => {
          try {
            await api.delete(`/api/observers/family-observers/${observerId}`);
            Alert.alert('Removed', `${name} has been removed.`);
            fetchObservers();
          } catch {
            Alert.alert('Error', 'Failed to remove observer');
          }
        },
      },
    ]);
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

          {/* Child header (avatar + name + chevron, opens bottom sheet to switch) */}
          <ChildHeader
            children={children}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />

          {/* FERPA visibility approvals banner */}
          {ferpaCount > 0 && (
            <Pressable onPress={() => router.push('/(app)/approvals' as any)}>
              <Card variant="outline" size="md" className="bg-amber-50 border-amber-200">
                <HStack className="items-center gap-3">
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="shield-checkmark-outline" size={20} color="#B45309" />
                  </View>
                  <VStack className="flex-1 min-w-0">
                    <UIText size="sm" style={{ color: '#92400E', fontFamily: 'Poppins_600SemiBold' }} numberOfLines={1}>
                      {ferpaCount} portfolio visibility {ferpaCount === 1 ? 'request' : 'requests'}
                    </UIText>
                    <UIText size="xs" style={{ color: '#B45309' }} numberOfLines={1}>
                      Review and approve before your child's portfolio goes public.
                    </UIText>
                  </VStack>
                  <Ionicons name="chevron-forward" size={18} color="#B45309" />
                </HStack>
              </Card>
            </Pressable>
          )}

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
                onOpenSettings={() => setSettingsMenuOpen(true)}
              />

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

              {/* Observers */}
              <VStack space="sm">
                <Heading size="md">Observers</Heading>
                <Card variant="elevated" size="md">
                  <VStack space="sm">
                    {observersLoading ? (
                      <UIText size="sm" className="text-typo-400">Loading...</UIText>
                    ) : observersList.length > 0 ? (
                      observersList.map((obs: any) => {
                        const name = obs.observer_name || obs.observer_email || 'Observer';
                        const obsInitials = (name?.[0] || '?').toUpperCase();
                        return (
                          <HStack key={obs.observer_id} className="items-center gap-3">
                            <Avatar size="sm">
                              {obs.avatar_url ? <AvatarImage source={{ uri: obs.avatar_url }} /> : <AvatarFallbackText>{obsInitials}</AvatarFallbackText>}
                            </Avatar>
                            <VStack className="flex-1 min-w-0">
                              <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>{name}</UIText>
                              {obs.observer_email && obs.observer_email !== name && (
                                <UIText size="xs" className="text-typo-400" numberOfLines={1}>{obs.observer_email}</UIText>
                              )}
                            </VStack>
                            <Pressable
                              onPress={() => handleRemoveObserver(obs.observer_id, name)}
                              hitSlop={8}
                              style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Ionicons name="close" size={16} color="#9CA3AF" />
                            </Pressable>
                          </HStack>
                        );
                      })
                    ) : (
                      <UIText size="sm" className="text-typo-400">No observers yet. Invite a grandparent, mentor, or family friend to follow this student's learning journey.</UIText>
                    )}

                    {pendingInvites.length > 0 && (
                      <>
                        <Divider className="my-1" />
                        <UIText size="xs" className="text-typo-400 font-poppins-semibold uppercase tracking-wider">Pending invites</UIText>
                        {pendingInvites.map((inv: any) => {
                          const daysLeft = Math.max(0, Math.ceil((new Date(inv.expires_at).getTime() - Date.now()) / 86400000));
                          const kidNames = (inv.children || []).map((c: any) => c.name).join(', ');
                          return (
                            <HStack key={inv.id} className="items-center gap-3">
                              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1EDF5', alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="link-outline" size={16} color="#6D469B" />
                              </View>
                              <VStack className="flex-1 min-w-0">
                                <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>{kidNames || 'Pending invite'}</UIText>
                                <UIText size="xs" className="text-typo-400">Expires in {daysLeft} day{daysLeft === 1 ? '' : 's'}</UIText>
                              </VStack>
                              <Pressable onPress={() => sharePendingInvite(inv.shareable_link, inv.children || [])} hitSlop={8} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="share-outline" size={16} color="#6D469B" />
                              </Pressable>
                              <Pressable onPress={() => revokePendingInvite(inv.id)} hitSlop={8} style={{ width: 28, height: 28, alignItems: 'center', justifyContent: 'center' }}>
                                <Ionicons name="close" size={16} color="#9CA3AF" />
                              </Pressable>
                            </HStack>
                          );
                        })}
                      </>
                    )}

                    <Button size="sm" variant="outline" onPress={openInviteFlow} className="self-start">
                      <ButtonText>Invite observer</ButtonText>
                    </Button>
                  </VStack>
                </Card>
              </VStack>

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

      {/* Student Settings Menu */}
      <Modal visible={settingsMenuOpen} transparent animationType="none" onRequestClose={() => setSettingsMenuOpen(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)' }} onPress={() => setSettingsMenuOpen(false)}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              top: '30%',
              left: 24,
              right: 24,
              backgroundColor: '#FFFFFF',
              borderRadius: 16,
              paddingVertical: 8,
            }}
          >
            <View style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F1EDF5' }}>
              <UIText size="sm" className="font-poppins-semibold">{selectedChild?.display_name || `${selectedChild?.first_name || ''} ${selectedChild?.last_name || ''}`.trim() || 'Student'}</UIText>
              <UIText size="xs" className="text-typo-400">Edit profile</UIText>
            </View>
            {[
              { key: 'photo', label: 'Change photo', icon: 'image-outline' as const, onPress: () => { setSettingsMenuOpen(false); handleUploadAvatar(); } },
              ...(isUnder13 && selectedChild?.is_dependent
                ? [{ key: 'login' as const, label: 'Promote to login account', icon: 'key-outline' as const, onPress: () => { setSettingsMenuOpen(false); handlePromote(); } }]
                : []),
            ].map((item) => (
              <Pressable key={item.key} onPress={item.onPress} style={{ paddingHorizontal: 20, paddingVertical: 14 }}>
                <HStack className="items-center gap-3">
                  <Ionicons name={item.icon} size={18} color="#6B6280" />
                  <UIText size="sm" className="font-poppins-medium">{item.label}</UIText>
                </HStack>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Invite Observer Flow */}
      <Modal visible={inviteFlowOpen} transparent animationType="none" onRequestClose={() => setInviteFlowOpen(false)}>
        <Pressable style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' }} onPress={() => setInviteFlowOpen(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 32 }}>
            <VStack space="md">
              <HStack className="items-center justify-between">
                <Heading size="lg">Invite an observer</Heading>
                <Pressable onPress={() => setInviteFlowOpen(false)} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                  <Ionicons name="close" size={18} color="#6B7280" />
                </Pressable>
              </HStack>

              {!generatedInvite ? (
                <>
                  {/* Privacy preview */}
                  <View style={{ backgroundColor: '#F8F6FB', borderRadius: 12, padding: 14 }}>
                    <UIText size="xs" className="text-optio-purple font-poppins-semibold uppercase tracking-wider">What they'll see</UIText>
                    <VStack space="xs" className="mt-2">
                      <HStack className="items-center gap-2">
                        <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                        <UIText size="xs" className="text-typo-600">Completed quests &amp; learning moments</UIText>
                      </HStack>
                      <HStack className="items-center gap-2">
                        <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                        <UIText size="xs" className="text-typo-600">XP totals and pillar progress</UIText>
                      </HStack>
                      <HStack className="items-center gap-2">
                        <Ionicons name="checkmark-circle" size={14} color="#16A34A" />
                        <UIText size="xs" className="text-typo-600">Public portfolio</UIText>
                      </HStack>
                      <HStack className="items-center gap-2">
                        <Ionicons name="close-circle" size={14} color="#9CA3AF" />
                        <UIText size="xs" className="text-typo-400">Personal info, private journal entries</UIText>
                      </HStack>
                    </VStack>
                  </View>

                  {/* Children picker */}
                  {children.length > 1 && (
                    <VStack space="xs">
                      <UIText size="xs" className="text-typo-500 font-poppins-semibold uppercase tracking-wider">Include</UIText>
                      {children.map((c) => {
                        const isOn = selectedChildrenForInvite.includes(c.id);
                        const name = c.display_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Student';
                        return (
                          <Pressable
                            key={c.id}
                            onPress={() => toggleChildForInvite(c.id)}
                            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}
                          >
                            <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: isOn ? '#6D469B' : '#D1D5DB', backgroundColor: isOn ? '#6D469B' : '#FFFFFF', alignItems: 'center', justifyContent: 'center' }}>
                              {isOn && <Ionicons name="checkmark" size={14} color="#FFFFFF" />}
                            </View>
                            <UIText size="sm" className="font-poppins-medium">{name}</UIText>
                          </Pressable>
                        );
                      })}
                    </VStack>
                  )}

                  <Button size="lg" onPress={generateInviteLink} loading={inviting} disabled={inviting || selectedChildrenForInvite.length === 0} className="w-full">
                    <ButtonText>{inviting ? 'Creating link...' : 'Generate link'}</ButtonText>
                  </Button>
                </>
              ) : (
                <>
                  <View style={{ backgroundColor: '#F8F6FB', borderRadius: 12, padding: 14 }}>
                    <UIText size="xs" className="text-optio-purple font-poppins-semibold uppercase tracking-wider mb-2">Your invite link</UIText>
                    <UIText size="xs" className="text-typo-600" numberOfLines={2}>{generatedInvite.link}</UIText>
                    <UIText size="xs" className="text-typo-400 mt-2">Expires in {Math.max(0, Math.ceil((new Date(generatedInvite.expiresAt).getTime() - Date.now()) / 86400000))} days</UIText>
                  </View>

                  <HStack className="gap-3">
                    <Button size="md" onPress={shareInviteLink} className="flex-1">
                      <ButtonText>Share link</ButtonText>
                    </Button>
                    <Button size="md" variant="outline" onPress={() => setQrVisible(true)} className="flex-1">
                      <ButtonText>Show QR</ButtonText>
                    </Button>
                  </HStack>

                  <Pressable onPress={() => { setGeneratedInvite(null); }} className="self-center py-2">
                    <UIText size="sm" className="text-optio-purple font-poppins-medium">Generate another</UIText>
                  </Pressable>
                </>
              )}
            </VStack>
          </Pressable>
        </Pressable>
      </Modal>

      {/* QR Code Modal */}
      <Modal visible={qrVisible} transparent animationType="fade" onRequestClose={() => setQrVisible(false)}>
        <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.85)', alignItems: 'center', justifyContent: 'center', padding: 24 }} onPress={() => setQrVisible(false)}>
          <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderRadius: 20, padding: 24, alignItems: 'center' }}>
            <Heading size="md" className="mb-1">Scan to join</Heading>
            <UIText size="xs" className="text-typo-400 mb-4">Have them scan with their phone camera</UIText>
            {generatedInvite?.link && (
              <QRCode value={generatedInvite.link} size={240} color="#1F1B2D" backgroundColor="#FFFFFF" />
            )}
            <Pressable onPress={() => setQrVisible(false)} className="mt-5">
              <UIText size="sm" className="text-optio-purple font-poppins-semibold">Done</UIText>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

    </SafeAreaView>
  );
}
