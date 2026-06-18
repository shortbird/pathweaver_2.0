/**
 * Unified Feed - All evidence from all sources (tasks, bounties, learning moments).
 *
 * Same endpoint and view for every role. The backend scopes results
 * by permissions (own activity, dependents, linked students, etc.).
 * Infinite scroll with cursor-based pagination.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, FlatList, ActivityIndicator, useWindowDimensions, Platform, Pressable, Image, ScrollView, Modal, KeyboardAvoidingView, AppState } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { useScrollToTop, useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { useAuthStore } from '@/src/stores/authStore';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useObserverStudents } from '@/src/hooks/useObserverStudents';
import { useIsObserver, useIsParent } from '@/src/hooks/useStartSomething';
import { useMyChildren } from '@/src/hooks/useParent';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { useFeedDetailStore } from '@/src/stores/feedDetailStore';
import { onUploadComplete } from '@/src/services/uploadQueue';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText, Divider,
  Avatar, AvatarFallbackText, AvatarImage, Skeleton,
} from '@/src/components/ui';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { getFlag, setFlag, PrefsKeys } from '@/src/stores/prefsStore';

const DESKTOP_BREAKPOINT = 768;

const OPTIO_ICON_URI =
  'https://auth.optioeducation.com/storage/v1/object/public/site-assets/logos/gradient_fav.svg';
// Local PNG logo. The SVG URI above does NOT render in React Native's <Image>
// (no SVG support), so welcome modals showed blank space where the logo should
// be — use the bundled app-icon PNG instead.
const OPTIO_LOGO = require('@/assets/images/icon.png');

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

type FeedSegment = 'feed' | 'students' | 'highlights';

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

// What an observer can actually DO — shown first (the functional orientation),
// as real labelled rows rather than decorative chips.
const OBSERVER_CAPABILITIES = [
  {
    icon: 'newspaper-outline' as const,
    color: '#3B82F6',
    bg: 'bg-blue-50',
    title: 'See their work',
    body: 'Everything they capture or complete shows up in your feed.',
  },
  {
    icon: 'chatbubble-outline' as const,
    color: '#E85D8A',
    bg: 'bg-optio-pink/5',
    title: 'Cheer them on',
    body: 'Leave a comment on anything they share.',
  },
  {
    icon: 'trophy-outline' as const,
    color: '#6D469B',
    bg: 'bg-optio-purple/10',
    title: 'Set bounties',
    body: 'Post a challenge they can take on — you review it and grant the reward.',
  },
];

// Coaching prompts for step 2 — the encouragement style Optio is built around.
const OBSERVER_FEEDBACK_TIPS = [
  { color: '#6D469B', title: 'Celebrate effort', example: '"I love how you tried a new approach."' },
  { color: '#E85D8A', title: 'Ask about the process', example: '"What was the most challenging part?"' },
  { color: '#3B82F6', title: 'Show genuine interest', example: '"Tell me more about this project."' },
  { color: '#10B981', title: 'Acknowledge growth', example: '"I can see how much you\'ve learned."' },
];

/**
 * Observer welcome — a two-step, skimmable intro shown on first observer login
 * (and re-openable via the "Tips" button in the feed header). Step 1 leads with
 * what an observer can DO; step 2 is how to give great feedback. A sticky footer
 * keeps the progress dots + primary action in view, and the hero is personalized
 * to the student(s) they're linked to.
 */
function ObserverWelcomeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const c = useThemeColors();
  // Only fetch the linked students while the modal is actually open.
  const { students } = useObserverStudents(visible);
  const [step, setStep] = useState(0);

  // Restart at step 1 each time it opens (incl. re-open via the Tips button).
  useEffect(() => { if (visible) setStep(0); }, [visible]);

  if (!visible) return null;

  const names = students
    .map((s) => s.display_name || `${s.first_name || ''} ${s.last_name || ''}`.trim())
    .filter(Boolean);
  const heroName =
    names.length === 0 ? null
      : names.length === 1 ? names[0]
        : `${names[0]} + ${names.length - 1} more`;
  const singleStudent = students.length === 1 ? students[0] : null;
  const singleName = singleStudent
    ? (singleStudent.first_name || singleStudent.display_name || 'their')
    : null;

  const finish = () => {
    onClose();
    // With exactly one linked student, drop straight into their activity.
    if (singleStudent) router.push(`/(app)/observers/student/${singleStudent.id}` as any);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <View style={{
          backgroundColor: c.card,
          borderRadius: 24,
          maxWidth: 480,
          width: '92%',
          maxHeight: '85%',
          overflow: 'hidden',
        }}>
          {/* Fixed hero */}
          <View style={{ paddingHorizontal: 24, paddingTop: 24, paddingBottom: 12 }}>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              style={{ position: 'absolute', right: 16, top: 16, zIndex: 10 }}
            >
              <View className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center dark:bg-dark-surface-200">
                <Ionicons name="close" size={18} color={c.icon} />
              </View>
            </Pressable>
            <VStack space="sm" className="items-center">
              <Image source={OPTIO_LOGO} style={{ width: 64, height: 64, borderRadius: 16 }} resizeMode="cover" />
              <Heading size="2xl" className="text-center">
                {heroName ? `You're observing ${heroName}` : "You're an observer"}
              </Heading>
              <UIText size="md" className="text-typo-500 text-center leading-6 dark:text-dark-typo-500">
                Cheer them on and set challenges as they learn. Optio is about the process, not grades.
              </UIText>
            </VStack>
          </View>

          {/* Scrollable step body */}
          <ScrollView
            style={{ flexShrink: 1 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}
          >
            {step === 0 ? (
              <VStack space="lg">
                <Heading size="lg">What you can do</Heading>
                {OBSERVER_CAPABILITIES.map((cap) => (
                  <HStack key={cap.title} className="items-start gap-3.5">
                    <View className={`w-12 h-12 rounded-full items-center justify-center ${cap.bg}`}>
                      <Ionicons name={cap.icon} size={24} color={cap.color} />
                    </View>
                    <VStack className="flex-1 min-w-0">
                      <UIText size="md" className="font-poppins-semibold">{cap.title}</UIText>
                      <UIText size="sm" className="text-typo-500 leading-6 dark:text-dark-typo-500">{cap.body}</UIText>
                    </VStack>
                  </HStack>
                ))}
              </VStack>
            ) : (
              <VStack space="lg">
                <VStack space="xs">
                  <Heading size="lg">Giving great feedback</Heading>
                  <UIText size="sm" className="text-typo-500 leading-6 dark:text-dark-typo-500">
                    A few words from you go a long way. Focus on the effort, not the outcome.
                  </UIText>
                </VStack>
                <VStack space="md">
                  {OBSERVER_FEEDBACK_TIPS.map((tip) => (
                    <HStack key={tip.title} className="items-start gap-3.5">
                      <View style={{ width: 4, backgroundColor: tip.color, borderRadius: 2, minHeight: 38, marginTop: 2 }} />
                      <VStack className="flex-1">
                        <UIText size="md" className="font-poppins-semibold">{tip.title}</UIText>
                        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">{tip.example}</UIText>
                      </VStack>
                    </HStack>
                  ))}
                </VStack>
              </VStack>
            )}
          </ScrollView>

          {/* Sticky footer: progress dots + actions (always in view) */}
          <View style={{ paddingHorizontal: 24, paddingTop: 12, paddingBottom: 24, borderTopWidth: 1, borderTopColor: c.border }}>
            <HStack className="items-center justify-center gap-1.5 mb-3">
              {[0, 1].map((i) => (
                <View
                  key={i}
                  style={{
                    width: i === step ? 18 : 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: i === step ? '#6D469B' : c.border,
                  }}
                />
              ))}
            </HStack>
            {step === 0 ? (
              <Button size="lg" onPress={() => setStep(1)} className="w-full">
                <ButtonText>Next</ButtonText>
              </Button>
            ) : (
              <HStack className="gap-3">
                <Button size="lg" variant="outline" onPress={() => setStep(0)} className="flex-1">
                  <ButtonText>Back</ButtonText>
                </Button>
                <Button size="lg" onPress={finish} className="flex-1">
                  <ButtonText>{singleName ? `View ${singleName}'s work` : 'Get started'}</ButtonText>
                </Button>
              </HStack>
            )}
          </View>
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
                      <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Challenge your kid with a real-world task and a reward.</UIText>
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
  // Superadmin gets a Highlights segment that flips the feed source to the
  // curated highlight reel.
  const isSuperadmin = useAuthStore((s) => s.user?.role) === 'superadmin';
  // When a parent filters to a specific kid, pass studentId so the feed
  // scopes to that kid's activity only. null → unfiltered (all kids + own).
  const { items, loading, loadingMore, hasMore, loadMore, refetch, setHighlighted } = useFeed({
    studentId: selectedKidId || undefined,
    highlightsOnly: segment === 'highlights',
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
    ({ viewableItems }: { viewableItems: Array<{ item: any }> }) => {
      setViewableIds(new Set(viewableItems.map((v) => v.item?.id).filter(Boolean) as string[]));
    },
  ).current;
  useScrollToTop(studentsScrollRef);

  // Auto-refresh the feed when the app returns to the foreground while the feed
  // tab is open (bug #4: "no way to refresh the feed when I reopen the app after
  // a while"). Scoped to focus via useFocusEffect so switching tabs doesn't reset
  // scroll, and so a reopen on another tab doesn't refetch here. Pull-to-refresh
  // still covers the manual case.
  const appStateRef = useRef(AppState.currentState);
  useFocusEffect(
    useCallback(() => {
      const sub = AppState.addEventListener('change', (next) => {
        if (appStateRef.current.match(/inactive|background/) && next === 'active') {
          refetch();
        }
        appStateRef.current = next;
      });
      return () => sub.remove();
    }, [refetch]),
  );

  // When a background media upload finishes (durable upload queue), refetch so
  // the real video/photo replaces the "Uploading…" placeholder without a manual
  // pull-to-refresh.
  useEffect(() => onUploadComplete(() => refetch()), [refetch]);

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
  const openPost = useCallback((item: any) => {
    // Hand the loaded item to the detail route (the feed API has no fetch-one
    // endpoint) and open the post on its own page.
    useFeedDetailStore.getState().setItem(item);
    router.push(`/(app)/post/${item.id}` as any);
  }, []);
  const renderItem = useCallback(
    ({ item }: { item: any }) => (
      <View className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
        <FeedCard
          item={item}
          viewerCanModerate={canModerateItem(item)}
          isActive={viewableIds.has(item.id)}
          onPress={() => openPost(item)}
          onHighlightChange={(id, on) => setHighlighted(id, on)}
        />
      </View>
    ),
    [isDesktop, canModerateItem, viewableIds, openPost, setHighlighted],
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
      {isSuperadmin && (
        <View className={`pb-3 ${isDesktop ? 'max-w-2xl w-full mx-auto' : ''}`}>
          <HStack className="bg-surface-100 rounded-xl p-1 dark:bg-dark-surface-200">
            {(['feed', 'highlights'] as FeedSegment[]).map((s) => {
              const active = segment === s;
              return (
                <Pressable
                  key={s}
                  onPress={() => setSegment(s)}
                  className={`flex-1 py-2.5 rounded-lg items-center flex-row gap-1.5 justify-center ${active ? 'bg-white dark:bg-dark-surface-100' : ''}`}
                >
                  {s === 'highlights' && (
                    <Ionicons name={active ? 'star' : 'star-outline'} size={14} color={active ? '#FF9028' : c.iconMuted} />
                  )}
                  <UIText size="sm" className={active ? 'font-poppins-semibold text-optio-purple' : 'text-typo-500 dark:text-dark-typo-500'}>
                    {s === 'feed' ? 'Feed' : 'Highlights'}
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
          // removeClippedSubviews detaches off-screen rows; with variable-height
          // feed images that made images flash in then blank out on scroll
          // (RN re-clips on the aspect-ratio layout pass). Keep it off and hold a
          // few more rows mounted so scrolling back doesn't remount/reload them.
          windowSize={7}
          maxToRenderPerBatch={5}
          removeClippedSubviews={false}
          initialNumToRender={5}
          updateCellsBatchingPeriod={100}
          scrollEventThrottle={64}
        />
      )}
      <ObserverWelcomeModal visible={welcomeVisible} onClose={dismissWelcome} />
      <ParentWelcomeModal visible={parentWelcomeVisible} onClose={dismissParentWelcome} />
    </SafeAreaView>
  );
}
