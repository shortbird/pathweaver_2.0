/**
 * Unified Feed - All evidence from all sources (tasks, bounties, learning moments).
 *
 * Same endpoint and view for every role. The backend scopes results
 * by permissions (own activity, dependents, linked students, etc.).
 * Infinite scroll with cursor-based pagination.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, FlatList, ActivityIndicator, useWindowDimensions, Platform, Pressable, Image, ScrollView, Modal, KeyboardAvoidingView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useObserverStudents } from '@/src/hooks/useObserverStudents';
import { useIsObserver, useIsParent } from '@/src/hooks/useStartSomething';
import { useMyChildren } from '@/src/hooks/useParent';
import { FeedCard } from '@/src/components/feed/FeedCard';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText, Divider,
  Avatar, AvatarFallbackText, AvatarImage, Skeleton,
} from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { getFlag, setFlag, PrefsKeys } from '@/src/stores/prefsStore';

const DESKTOP_BREAKPOINT = 768;

const OPTIO_ICON_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg';

function relativeTime(iso?: string | null): string {
  if (!iso) return 'No activity yet';
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

type FeedSegment = 'feed' | 'students';

function StudentsList({ isDesktop }: { isDesktop: boolean }) {
  const { students, loading } = useObserverStudents(true);
  const c = useThemeColors();

  if (loading) {
    return (
      <VStack space="sm" className={`px-5 md:px-0 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </VStack>
    );
  }

  if (students.length === 0) {
    return (
      <View className={`px-5 md:px-0 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="people-outline" size={40} color={c.iconMuted} />
          <Heading size="sm" className="text-typo-500 mt-3 dark:text-dark-typo-500">No students linked</Heading>
          <UIText size="sm" className="text-typo-400 mt-1 text-center px-4 dark:text-dark-typo-400">
            Once a student or their parent invites you, they'll show up here.
          </UIText>
        </Card>
      </View>
    );
  }

  return (
    <VStack space="sm" className={`px-5 md:px-0 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
      {students.map((s) => {
        const initials = `${s.first_name?.[0] || ''}${s.last_name?.[0] || ''}`.toUpperCase()
          || (s.display_name?.[0] || '?').toUpperCase();
        const name = s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim() || 'Student';
        const hasPending = (s.pending_count || 0) > 0;
        return (
          <Pressable
            key={s.id}
            onPress={() => router.push(`/(app)/observers/student/${s.id}` as any)}
          >
            <Card variant="outline" size="md">
              <HStack className="items-center gap-3">
                <View>
                  <Avatar size="md">
                    {s.avatar_url ? (
                      <AvatarImage source={{ uri: s.avatar_url }} />
                    ) : (
                      <AvatarFallbackText>{initials}</AvatarFallbackText>
                    )}
                  </Avatar>
                  {hasPending && (
                    <View style={{
                      position: 'absolute', top: -2, right: -2,
                      width: 12, height: 12, borderRadius: 6,
                      backgroundColor: '#EF597B',
                      borderWidth: 2, borderColor: '#FFFFFF',
                    }} />
                  )}
                </View>
                <VStack className="flex-1 min-w-0">
                  <UIText size="md" style={{ fontFamily: 'Poppins_600SemiBold' }} numberOfLines={1}>
                    {name}
                  </UIText>
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>
                    {s.last_active_at ? `Active ${relativeTime(s.last_active_at)}` : 'No activity yet'}
                    {hasPending ? ` · ${s.pending_count} new` : ''}
                  </UIText>
                </VStack>
                <Ionicons name="chevron-forward" size={18} color={c.iconMuted} />
              </HStack>
            </Card>
          </Pressable>
        );
      })}
    </VStack>
  );
}

function ObserverWelcomeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useThemeColors();
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{
          backgroundColor: c.card,
          borderRadius: 24,
          maxWidth: 480,
          width: '92%',
          maxHeight: '85%',
        }}>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 24 }}
          >
            <VStack space="lg">
              {/* Close button */}
              <Pressable
                onPress={onClose}
                style={{ position: 'absolute', right: 0, top: 0, zIndex: 10, padding: 4 }}
              >
                <View className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center dark:bg-dark-surface-200">
                  <Ionicons name="close" size={18} color={c.icon} />
                </View>
              </Pressable>

              {/* Hero */}
              <VStack space="sm" className="items-center pt-2">
                <Image
                  source={{ uri: OPTIO_ICON_URI }}
                  style={{ width: 48, height: 48 }}
                  resizeMode="contain"
                />
                <Heading size="xl" className="text-center">Welcome to Optio!</Heading>
                <UIText size="sm" className="text-typo-500 text-center dark:text-dark-typo-500">
                  Here's how you can support and celebrate the student's learning journey.
                </UIText>
              </VStack>

              {/* Philosophy */}
              <VStack space="xs">
                <Heading size="md">The Process Is The Goal</Heading>
                <UIText size="sm" className="text-typo-500 leading-5 dark:text-dark-typo-500">
                  We celebrate curiosity, effort, and growth - not grades or test scores.
                  Students learn by doing self-directed quests that build real-world skills.
                </UIText>
              </VStack>

              <Divider />

              {/* Tips */}
              <VStack space="xs">
                <Heading size="md">Observer Tips</Heading>
                <VStack space="sm" className="mt-1">
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#6D469B', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Celebrate Effort</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">"I love how you tried a new approach!"</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#E85D8A', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Ask Process Questions</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">"What was the most challenging part?"</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#3B82F6', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Show Genuine Interest</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">"Tell me more about this project!"</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#10B981', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Acknowledge Growth</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">"I can see how much you've learned!"</UIText>
                    </VStack>
                  </HStack>
                </VStack>
              </VStack>

              <Divider />

              {/* What You Can Do */}
              <VStack space="xs">
                <Heading size="md">What You Can Do</Heading>
                <HStack className="flex-wrap gap-2 mt-1">
                  <HStack className="items-center gap-2 bg-optio-pink/5 rounded-lg px-3 py-2">
                    <Ionicons name="chatbubble-outline" size={16} color="#E85D8A" />
                    <UIText size="xs" className="font-poppins-medium">Comment</UIText>
                  </HStack>
                  <HStack className="items-center gap-2 bg-blue-50 rounded-lg px-3 py-2">
                    <Ionicons name="newspaper-outline" size={16} color="#3B82F6" />
                    <UIText size="xs" className="font-poppins-medium">View Feed</UIText>
                  </HStack>
                  <HStack className="items-center gap-2 bg-green-50 rounded-lg px-3 py-2">
                    <Ionicons name="share-outline" size={16} color="#10B981" />
                    <UIText size="xs" className="font-poppins-medium">Share</UIText>
                  </HStack>
                </HStack>
              </VStack>

              {/* CTA */}
              <Button size="lg" onPress={onClose} className="w-full mt-2">
                <ButtonText>Got It</ButtonText>
              </Button>
            </VStack>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

function ParentWelcomeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useThemeColors();
  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{ backgroundColor: c.card, borderRadius: 24, maxWidth: 480, width: '92%', maxHeight: '85%' }}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 24 }}>
            <VStack space="lg">
              <Pressable
                onPress={onClose}
                style={{ position: 'absolute', right: 0, top: 0, zIndex: 10, padding: 4 }}
              >
                <View className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center dark:bg-dark-surface-200">
                  <Ionicons name="close" size={18} color={c.icon} />
                </View>
              </Pressable>

              <VStack space="sm" className="items-center pt-2">
                <Image source={{ uri: OPTIO_ICON_URI }} style={{ width: 48, height: 48 }} resizeMode="contain" />
                <Heading size="xl" className="text-center">Welcome to Optio!</Heading>
                <UIText size="sm" className="text-typo-500 text-center dark:text-dark-typo-500">
                  Here's how you can support your kid's learning journey.
                </UIText>
              </VStack>

              <VStack space="xs">
                <Heading size="md">The Process Is The Goal</Heading>
                <UIText size="sm" className="text-typo-500 leading-5 dark:text-dark-typo-500">
                  We celebrate curiosity, effort, and growth — not grades or test scores.
                  Your kid learns by doing self-directed quests that build real-world skills.
                </UIText>
              </VStack>

              <Divider />

              <VStack space="xs">
                <Heading size="md">What you can do as a parent</Heading>
                <VStack space="sm" className="mt-1">
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#6D469B', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Capture moments</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Tap the center button to log what your kid is doing in real life.</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#E85D8A', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Post bounties</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Challenge your kid with a real-world task and reward (XP or $).</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#3B82F6', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Invite observers</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Bring grandparents, mentors, or family friends along for the ride.</UIText>
                    </VStack>
                  </HStack>
                  <HStack className="items-start gap-3">
                    <View style={{ width: 4, backgroundColor: '#10B981', borderRadius: 2, minHeight: 32, marginTop: 2 }} />
                    <VStack className="flex-1">
                      <UIText size="sm" className="font-poppins-semibold">Celebrate effort, not outcomes</UIText>
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Ask "what did you try?" instead of "did you finish?"</UIText>
                    </VStack>
                  </HStack>
                </VStack>
              </VStack>

              <Button size="lg" onPress={onClose} className="w-full mt-2">
                <ButtonText>Got it</ButtonText>
              </Button>
            </VStack>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export default function FeedScreen() {
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;
  const c = useThemeColors();
  const isObserver = useIsObserver();
  const isParent = useIsParent();
  const [welcomeVisible, setWelcomeVisible] = useState(false);
  const [parentWelcomeVisible, setParentWelcomeVisible] = useState(false);
  const [segment, setSegment] = useState<FeedSegment>('feed');
  // Parent-only: which kid is the feed scoped to. null = all kids.
  const [selectedKidId, setSelectedKidId] = useState<string | null>(null);
  // When a parent filters to a specific kid, pass studentId so the feed
  // scopes to that kid's activity only. null → unfiltered (all kids + own).
  const { items, loading, loadingMore, hasMore, loadMore, refetch } = useFeed({
    studentId: selectedKidId || undefined,
  });
  const { children: parentKids } = useMyChildren();
  const listRef = useRef<FlatList<any>>(null);
  const studentsScrollRef = useRef<ScrollView>(null);
  useScrollToTop(listRef);

  // Track which feed items are on-screen so an inline video pauses when scrolled
  // past instead of playing audio off-screen. onViewableItemsChanged must keep a
  // stable identity (FlatList errors otherwise), hence the refs.
  const [viewableIds, setViewableIds] = useState<Set<string>>(new Set());
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;
  const onViewableItemsChanged = useRef(
    (info: { viewableItems: Array<{ item: { id?: string } }> }) => {
      setViewableIds(new Set(info.viewableItems.map((v) => v.item?.id).filter(Boolean) as string[]));
    },
  ).current;
  useScrollToTop(studentsScrollRef);

  // Auto-show on first visit for observers (cross-platform via prefsStore)
  useEffect(() => {
    if (!isObserver) return;
    let cancelled = false;
    getFlag(PrefsKeys.ObserverWelcomeSeen).then((seen) => {
      if (!cancelled && !seen) setWelcomeVisible(true);
    });
    return () => { cancelled = true; };
  }, [isObserver]);

  // Same one-shot welcome for parents.
  useEffect(() => {
    if (!isParent) return;
    let cancelled = false;
    getFlag(PrefsKeys.ParentWelcomeSeen).then((seen) => {
      if (!cancelled && !seen) setParentWelcomeVisible(true);
    });
    return () => { cancelled = true; };
  }, [isParent]);

  const dismissWelcome = () => {
    setWelcomeVisible(false);
    setFlag(PrefsKeys.ObserverWelcomeSeen).catch(() => { /* ignore */ });
  };
  const dismissParentWelcome = () => {
    setParentWelcomeVisible(false);
    setFlag(PrefsKeys.ParentWelcomeSeen).catch(() => { /* ignore */ });
  };

  // Parents can mark a kid's item private. Compute kid-id membership per
  // item rather than blanket-granting "viewerCanModerate" — the feed may
  // also contain observer-linked students that aren't this parent's kids.
  // Memoize the set + the per-item check + renderItem so they're stable
  // across re-renders — otherwise `memo(FeedCard)` is defeated and every
  // card re-renders on any parent-screen state change.
  const parentKidIdSet = useMemo(
    () => new Set(parentKids.map((c: any) => c.id)),
    [parentKids],
  );
  const canModerateItem = useCallback(
    (item: any) => isParent && !!item?.student?.id && parentKidIdSet.has(item.student.id),
    [isParent, parentKidIdSet],
  );
  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <View className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
        <FeedCard item={item} viewerCanModerate={canModerateItem(item)} isActive={viewableIds.has(item.id)} />
      </View>
    ),
    [isDesktop, canModerateItem, viewableIds],
  );

  const renderHeader = () => (
    <>
      <View className={`pt-2 md:pt-6 pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <HStack className="items-center justify-between">
          <VStack>
            {isDesktop && <Heading size="xl">{isObserver ? 'Activity' : isParent ? 'Family activity' : 'Feed'}</Heading>}
            <UIText size="sm" className="text-typo-500 mt-1 dark:text-dark-typo-500">
              {isObserver
                ? 'Stay close to the students you observe'
                : isParent
                  ? "What your kids have been up to"
                  : 'Recent completions and learning moments'}
            </UIText>
          </VStack>
          {(isObserver || isParent) && (
            <Pressable
              onPress={() => (isParent ? setParentWelcomeVisible(true) : setWelcomeVisible(true))}
              className="flex-row items-center gap-1.5 px-3 py-1.5 rounded-lg bg-optio-purple/10 active:bg-optio-purple/20"
            >
              <Ionicons name="bulb-outline" size={16} color="#6D469B" />
              <UIText size="xs" className="text-optio-purple font-poppins-medium">Tips</UIText>
            </Pressable>
          )}
        </HStack>
      </View>
      {isObserver && (
        <View className={`pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
          <HStack className="bg-surface-100 rounded-xl p-1 dark:bg-dark-surface-200">
            {(['feed', 'students'] as FeedSegment[]).map((s) => {
              const active = segment === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSegment(s)}
                  className={`flex-1 py-2.5 rounded-lg items-center ${active ? 'bg-white dark:bg-dark-surface-100' : ''}`}
                >
                  <UIText size="sm" className={active ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>
                    {s === 'feed' ? 'Feed' : 'Students'}
                  </UIText>
                </Pressable>
              );
            })}
          </HStack>
        </View>
      )}
      {/* Per-kid filter chips for parents with 2+ kids. Single-kid families
       *  don't need the chip row — there's nothing to filter to. */}
      {isParent && parentKids.length > 1 && (
        <View className={`pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <HStack space="xs" className="items-center">
              <Pressable onPress={() => setSelectedKidId(null)}>
                <View className={`px-3 py-1.5 rounded-full ${selectedKidId === null ? 'bg-optio-purple' : 'bg-surface-100 dark:bg-dark-surface-200'}`}>
                  <UIText size="xs" className={`font-poppins-medium ${selectedKidId === null ? 'text-white' : 'text-typo-600'}`}>
                    All kids
                  </UIText>
                </View>
              </Pressable>
              {parentKids.map((kid: any) => {
                const isActive = selectedKidId === kid.id;
                return (
                  <Pressable key={kid.id} onPress={() => setSelectedKidId(kid.id)}>
                    <View className={`px-3 py-1.5 rounded-full ${isActive ? 'bg-optio-purple' : 'bg-surface-100 dark:bg-dark-surface-200'}`}>
                      <UIText size="xs" className={`font-poppins-medium ${isActive ? 'text-white' : 'text-typo-600'}`}>
                        {kid.first_name || kid.display_name || 'Kid'}
                      </UIText>
                    </View>
                  </Pressable>
                );
              })}
            </HStack>
          </ScrollView>
        </View>
      )}
    </>
  );

  const renderEmpty = () => {
    if (loading) return null;
    return (
      <View className={`px-5 md:px-0 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
        <Card variant="filled" size="lg" className="items-center py-10">
          <Ionicons name="newspaper-outline" size={40} color={c.iconMuted} />
          <Heading size="sm" className="text-typo-500 mt-3 dark:text-dark-typo-500">No activity yet</Heading>
          <UIText size="sm" className="text-typo-400 mt-1 text-center px-4 dark:text-dark-typo-400">
            {isParent
              ? "Tap the center button to capture a moment for your kid, or post a bounty to challenge them."
              : isObserver
                ? "Activity from the students you observe will show up here."
                : "Complete tasks and capture learning moments to build your feed."}
          </UIText>
        </Card>
      </View>
    );
  };

  const renderFooter = () => {
    if (loadingMore) {
      return (
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#6D469B" />
        </View>
      );
    }
    if (!hasMore && items.length > 0) {
      return (
        <View className="items-center py-6">
          <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">You've reached the end</UIText>
        </View>
      );
    }
    return null;
  };

  if (loading && items.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator size="large" color="#6D469B" />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
      <PageHeader title={isObserver ? 'Activity' : 'Feed'} />
      {isObserver && segment === 'students' ? (
        <ScrollView
          ref={studentsScrollRef}
          className="flex-1"
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
          showsVerticalScrollIndicator={false}
          scrollEventThrottle={64}
        >
          {renderHeader()}
          <StudentsList isDesktop={isDesktop} />
        </ScrollView>
      ) : (
        <FlatList
          ref={listRef}
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16 }}
          ItemSeparatorComponent={() => <View className="h-3" />}
          onEndReached={loadMore}
          onEndReachedThreshold={0.3}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          refreshing={false}
          onRefresh={refetch}
          showsVerticalScrollIndicator={false}
          windowSize={3}
          maxToRenderPerBatch={3}
          removeClippedSubviews={Platform.OS !== 'web'}
          initialNumToRender={4}
          updateCellsBatchingPeriod={100}
          scrollEventThrottle={64}
        />
      )}
      <ObserverWelcomeModal visible={welcomeVisible} onClose={dismissWelcome} />
      <ParentWelcomeModal visible={parentWelcomeVisible} onClose={dismissParentWelcome} />
    </SafeAreaView>
  );
}
