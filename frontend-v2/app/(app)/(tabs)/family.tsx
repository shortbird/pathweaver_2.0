/**
 * Parent Dashboard - View and monitor linked children's learning.
 *
 * Desktop: child tabs + full overview with engagement calendar.
 * Mobile: child selector dropdown + scrollable overview.
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Platform, useWindowDimensions, Image, RefreshControl, Alert, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMyChildren, useChildDashboard, useChildEngagement } from '@/src/hooks/useParent';
import { useFeed } from '@/src/hooks/useFeed';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { PillarBadge } from '@/src/components/ui/pillar-badge';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import api from '@/src/services/api';
import { useAuthStore } from '@/src/stores/authStore';
import { useInviteObserverStore } from '@/src/stores/inviteObserverStore';
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

function QuestsList({
  quests,
  label,
  studentId,
  tappable = false,
}: {
  quests: any[];
  label: string;
  /** Required when `tappable` so cards can deep-link into the parent quest view. */
  studentId?: string | null;
  /** Active quests are tappable (opens the parent quest view to add evidence);
   *  completed quests are read-only for now. */
  tappable?: boolean;
}) {
  if (!quests || quests.length === 0) return null;

  return (
    <VStack space="sm">
      <Heading size="md">{label}</Heading>
      {quests.map((q: any) => {
        const quest = q.quests || q;
        const questId = q.quest_id || q.id || quest.id;
        const cardBody = (
          <Card variant="outline" size="md">
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
              {tappable && <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />}
            </HStack>
          </Card>
        );
        if (tappable && studentId) {
          return (
            <Pressable
              key={questId}
              onPress={() => router.push(`/parent/quest/${studentId}/${questId}` as any)}
              accessibilityLabel={`Open ${quest.title}`}
            >
              {cardBody}
            </Pressable>
          );
        }
        return <View key={questId}>{cardBody}</View>;
      })}
    </VStack>
  );
}

// ── OpenEd Academy entry (only for OEA-program parents) ──
// Persistent way into the OpenEd Academy diploma flow (choose pathways / track
// credits). The post-signup redirect only fires once and is skipped when email
// verification is on, so this is the reliable entry point for OEA parents.

function OpenEdAcademyEntry() {
  return (
    <Pressable
      onPress={() => router.push('/(app)/oea/welcome' as any)}
      accessibilityLabel="OpenEd Academy"
    >
      <Card variant="outline" size="md">
        <HStack className="items-center gap-3">
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1EDF5', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="school-outline" size={18} color="#6D469B" />
          </View>
          <VStack className="flex-1 min-w-0">
            <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>OpenEd Academy</UIText>
            <UIText size="xs" className="text-typo-400" numberOfLines={1}>Choose diploma pathways and track credits</UIText>
          </VStack>
          <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
        </HStack>
      </Card>
    </Pressable>
  );
}

// ── Main Page ──

export default function ParentDashboardPage() {
  const isOEAParent = useAuthStore((s) => s.user?.program_key) === 'opened-academy';
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const scrollRef = useRef<ScrollView>(null);
  // Tap the active Family tab to scroll back to the top.
  useScrollToTop(scrollRef);

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
  // Observer admin (list / remove / per-kid toggles / regenerate link) all
  // happens inside the Manage Observers sheet. The Family dashboard pulls
  // just the observer count so the summary tile can show "3 observers."
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

  useEffect(() => {
    fetchObservers();
  }, [fetchObservers]);

  const isUnder13 = useMemo(() => {
    if (!selectedChild?.date_of_birth) return false;
    const now = new Date();
    const cutoff = new Date(now.getFullYear() - 13, now.getMonth(), now.getDate());
    return new Date(selectedChild.date_of_birth) > cutoff;
  }, [selectedChild]);

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
            text: 'Create Login', onPress: async (email: string | undefined) => {
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
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center" edges={['top', 'left', 'right']}>
        <ActivityIndicator size="large" color="#6D469B" />
      </SafeAreaView>
    );
  }

  // No children
  if (children.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center px-8">
          <Ionicons name="people-outline" size={56} color="#9CA3AF" />
          <Heading size="lg" className="text-typo-500 mt-4 text-center">No students linked</Heading>
          <UIText size="sm" className="text-typo-400 mt-2 text-center">
            Add a dependent or connect with a student to view their learning dashboard.
          </UIText>
          <Button size="lg" className="mt-6">
            <ButtonText>Add a Child</ButtonText>
          </Button>
          {isOEAParent && (
            <View className="mt-6 w-full max-w-sm">
              <OpenEdAcademyEntry />
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }


  return (
    <SafeAreaView className="flex-1 bg-surface-50" edges={['top', 'left', 'right']}>
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 16 }}
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

          {/* OpenEd Academy entry (OEA-program parents only) */}
          {isOEAParent && <OpenEdAcademyEntry />}

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
                  <QuestsList
                    quests={dashboard?.active_quests || []}
                    label="Active Quests"
                    studentId={selectedId}
                    tappable
                  />
                  <QuestsList quests={dashboard?.completed_quests || []} label="Completed" />
                  {(!dashboard?.active_quests?.length && !dashboard?.completed_quests?.length) && (
                    <Card variant="filled" size="md" className="items-center py-8">
                      <Ionicons name="rocket-outline" size={32} color="#9CA3AF" />
                      <UIText size="sm" className="text-typo-400 mt-2">No quests yet</UIText>
                    </Card>
                  )}
                </VStack>
              </View>

              {/* Observers summary tile — opens the Manage Observers sheet
                  which is the canonical surface for invite, list, remove,
                  toggle, and revoke. Keeping the Family dashboard focused on
                  the kid by pulling all observer admin into one place. */}
              <Pressable
                testID="family-observers-summary"
                onPress={() => useInviteObserverStore.getState().open()}
                accessibilityLabel="Manage observers"
              >
                <Card variant="outline" size="md">
                  <HStack className="items-center gap-3">
                    <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1EDF5', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="people-outline" size={18} color="#6D469B" />
                    </View>
                    <VStack className="flex-1 min-w-0">
                      <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>
                        {observersLoading
                          ? 'Observers'
                          : observersList.length === 0
                            ? 'Invite an observer'
                            : `${observersList.length} observer${observersList.length === 1 ? '' : 's'}`}
                      </UIText>
                      <UIText size="xs" className="text-typo-400" numberOfLines={1}>
                        {observersList.length === 0
                          ? 'Share your family link with grandparents, mentors, friends'
                          : 'Tap to manage'}
                      </UIText>
                    </VStack>
                    <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                  </HStack>
                </Card>
              </Pressable>

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
                      <FeedCard key={item.id} item={item} showStudent={false} viewerCanModerate />
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

    </SafeAreaView>
  );
}
