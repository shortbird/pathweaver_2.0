/**
 * Dashboard - Student home screen.
 *
 * Engagement-focused: shows learning rhythm and activity heatmaps,
 * not task completion percentages.
 *
 * Desktop: sidebar (from layout) + wide content with 2-3 column grids.
 * Mobile: single column with bottom tabs.
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, ScrollView, Image, Pressable, useWindowDimensions, RefreshControl, Modal, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useScrollToTop } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { useDashboard } from '@/src/hooks/useDashboard';
import { useUnifiedTopics } from '@/src/hooks/useJournal';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import api from '@/src/services/api';
import type { EngagementData } from '@/src/hooks/useDashboard';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText,
  Card, Badge, BadgeText, Divider, Avatar, AvatarFallbackText, AvatarImage,
  Skeleton,
} from '@/src/components/ui';
import { MiniHeatmap } from '@/src/components/engagement/MiniHeatmap';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { CaptureSheet } from '@/src/components/capture/CaptureSheet';
import { ClassCard } from '@/src/components/class/ClassCard';
import { CourseCard } from '@/src/components/course/CourseCard';
import { HomeBountyCard } from '@/src/components/bounties/HomeBountyCard';
import { useMyClaims } from '@/src/hooks/useBounties';
import { useStartSomething } from '@/src/hooks/useStartSomething';

// ── Quest Card with engagement ──

function QuestCard({ quest }: { quest: any }) {
  const q = quest.quests;
  const [engagement, setEngagement] = useState<EngagementData | null>(null);

  useEffect(() => {
    if (!q?.id) return;
    (async () => {
      try {
        const { data } = await api.get(`/api/quests/${q.id}/engagement`);
        setEngagement(data.engagement || data);
      } catch {
        // Non-critical
      }
    })();
  }, [q?.id]);

  const imageUrl = q?.header_image_url || q?.image_url;
  const days = engagement?.calendar?.days || [];

  return (
    <Pressable testID={`quest-card-${q?.id}`} onPress={() => router.push(`/(app)/quests/${q?.id}`)} className="md:h-full">
    <Card variant="elevated" size="md" className="min-w-0 overflow-hidden md:h-full">
      {/* Quest image */}
      {imageUrl ? (
        <View className="h-28 -mx-4 -mt-4 mb-4 overflow-hidden rounded-t-xl">
          <Image
            source={{ uri: imageUrl }}
            className="w-full h-full"
            resizeMode="cover"
          />
          {/* Gradient overlay with title */}
          <View className="absolute bottom-0 left-0 right-0 p-3 bg-black/40">
            <UIText size="sm" className="text-white font-poppins-semibold" numberOfLines={1}>
              {q?.title || 'Quest'}
            </UIText>
          </View>
        </View>
      ) : (
        <UIText size="sm" className="font-poppins-semibold mb-2" numberOfLines={1}>
          {q?.title || 'Quest'}
        </UIText>
      )}

      {/* Rhythm + mini heatmap */}
      <HStack className="items-center justify-between mb-2">
        <RhythmBadge rhythm={engagement?.rhythm || null} compact />
        {days.length > 0 && <MiniHeatmap days={days} />}
      </HStack>

      {/* Description — only renders if there is one, no flex-1 pad-out */}
      {q?.description ? (
        <UIText size="xs" className="text-typo-500 dark:text-dark-typo-500" numberOfLines={2}>
          {q.description}
        </UIText>
      ) : null}
    </Card>
    </Pressable>
  );
}

// ── Welcome Header ──

function WelcomeHeader({ user, stats, activeQuestCount }: { user: any; stats: any; activeQuestCount: number }) {
  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase();
  const c = useThemeColors();

  return (
    <Card testID="welcome-header" variant="elevated" size="lg">
      {/* Top: avatar (tappable → Profile) + greeting.
          Visual affordances for tap: thin purple ring, drop shadow, and a small
          chevron badge in the bottom-right of the avatar. Together they read as
          "this opens something" rather than just "this is your picture". */}
      <HStack className="items-center gap-3 md:gap-4">
        <Pressable
          onPress={() => router.push('/(app)/(tabs)/profile')}
          accessibilityLabel="Open your profile"
          accessibilityRole="button"
          hitSlop={8}
          style={({ pressed }) => ({
            position: 'relative',
            padding: 3,
            borderRadius: 999,
            backgroundColor: c.card,
            borderWidth: 2,
            borderColor: '#6D469B',
            shadowColor: '#6D469B',
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 2 },
            elevation: 3,
            opacity: pressed ? 0.7 : 1,
          })}
        >
          <Avatar size="lg" className="flex-shrink-0">
            {user?.avatar_url ? (
              <AvatarImage source={{ uri: user.avatar_url }} />
            ) : (
              <AvatarFallbackText>{initials}</AvatarFallbackText>
            )}
          </Avatar>
          {/* Small chevron overlay — signals "drill in" */}
          <View
            style={{
              position: 'absolute',
              bottom: -2,
              right: -2,
              width: 22,
              height: 22,
              borderRadius: 11,
              backgroundColor: '#6D469B',
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: 2,
              borderColor: '#FFFFFF',
            }}
          >
            <Ionicons name="chevron-forward" size={12} color="#FFFFFF" />
          </View>
        </Pressable>
        <VStack className="flex-1 min-w-0">
          <Heading testID="welcome-greeting" size="md" className="md:text-2xl" numberOfLines={1}>
            Welcome back, {user?.first_name || 'Student'}!
          </Heading>
          <UIText size="xs" className="text-typo-400 mt-0.5 dark:text-dark-typo-400">Tap your photo to open your profile</UIText>
        </VStack>
      </HStack>

      {/* Bottom: stats */}
      <Divider className="mt-4 mb-3" />
      <HStack testID="hero-stats" className="justify-around">
        <VStack className="items-center">
          <UIText testID="stat-completed-quests" size="lg" className="font-poppins-bold text-optio-purple">
            {stats?.completed_quests_count || 0}
          </UIText>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Completed Quests</UIText>
        </VStack>
        <VStack className="items-center">
          <UIText testID="stat-total-xp" size="lg" className="font-poppins-bold text-optio-pink">
            {(stats?.total_xp || user?.total_xp || 0).toLocaleString()}
          </UIText>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Total XP</UIText>
        </VStack>
        <VStack className="items-center">
          <UIText testID="stat-active-quests" size="lg" className="font-poppins-bold text-pillar-stem">
            {activeQuestCount}
          </UIText>
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Active Quests</UIText>
        </VStack>
      </HStack>
    </Card>
  );
}

// ── Skeleton ──

function DashboardSkeleton() {
  return (
    <VStack space="lg" className="px-5 md:px-8 pt-6 pb-12">
      <Skeleton className="h-24 w-full rounded-2xl" />
      <Skeleton className="h-6 w-40" />
      <HStack space="md">
        <Skeleton className="h-52 flex-1 rounded-xl" />
        <Skeleton className="h-52 flex-1 rounded-xl hidden md:flex" />
        <Skeleton className="h-52 flex-1 rounded-xl hidden lg:flex" />
      </HStack>
      <HStack space="md">
        <Skeleton className="h-48 flex-1 rounded-xl" />
        <Skeleton className="h-48 flex-1 rounded-xl hidden md:flex" />
      </HStack>
    </VStack>
  );
}

// ── Main Dashboard ──

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const { data, loading, refetch } = useDashboard();
  // Active bounty claims surface in the unified list below. Fetched here
  // (not via the dashboard endpoint) so it must stay above the early-return
  // skeleton — otherwise hook order changes between renders and React
  // throws "Rendered more hooks than during the previous render."
  const { claims: bountyClaims, refetch: refetchClaims } = useMyClaims();
  // Journal topics surfaced on Home (bug #34) — same source as the Journal tab.
  const { topics: journalTopics } = useUnifiedTopics();
  const [refreshing, setRefreshing] = useState(false);
  // The role-aware "Optio button" action — same flow as the mobile center tab.
  const startSomething = useStartSomething();
  const scrollRef = useRef<ScrollView>(null);
  // Standard iOS pattern: tap the active Home tab to scroll the dashboard
  // back to the top.
  useScrollToTop(scrollRef);
  const isWeb = Platform.OS === 'web';

  // Refetch every time the dashboard regains focus. The previous
  // `if (data) refetch()` guard was captured with empty deps, so `data` was
  // frozen at its initial null value and refetch never fired after returning
  // from a quest (e.g. after Leave Quest), leaving stale active-quest cards.
  useFocusEffect(
    useCallback(() => {
      refetch();
      // Bounty claims are fetched separately (not part of /api/dashboard).
      // Refetch on focus too so a bounty just claimed on the detail page
      // appears in "What you're working on" without a manual reload.
      refetchClaims();
    }, [refetch, refetchClaims])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (loading && !data) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  const activeQuests = data?.active_quests || [];
  const enrolledCourses = data?.enrolled_courses || [];

  // Unified "What you're working on" list. Order: bounties (explicit reward
  // + deadline = highest immediate obligation) -> classes (transcript credit)
  // -> courses (structured curriculum) -> quests (open exploration). Each
  // card type has a distinct visual signature so the list reads as one
  // tidy section.
  type ListItem =
    | { kind: 'bounty'; id: string; claim: any }
    | { kind: 'class'; id: string; quest: any }
    | { kind: 'course'; id: string; course: any }
    | { kind: 'quest'; id: string; quest: any };
  const bountyItems: ListItem[] = (bountyClaims || [])
    // Surface active claims only — approved/rejected aren't "in progress"
    // anymore, so they drop off Home (they still show on the bounty detail).
    .filter((c: any) =>
      c.status === 'claimed' ||
      c.status === 'submitted' ||
      c.status === 'revision_requested'
    )
    .map((c: any) => ({ kind: 'bounty', id: `bounty-${c.id}`, claim: c }));
  const classItems: ListItem[] = activeQuests
    .filter((uq: any) => (uq.quests?.quest_type || uq.quest_type) === 'class')
    .map((uq: any) => ({ kind: 'class', id: `class-${uq.id}`, quest: uq }));
  const courseItems: ListItem[] = enrolledCourses.map((c: any) => ({
    kind: 'course', id: `course-${c.id}`, course: c,
  }));
  const questItems: ListItem[] = activeQuests
    .filter((uq: any) => (uq.quests?.quest_type || uq.quest_type) !== 'class')
    .map((uq: any) => ({ kind: 'quest', id: `quest-${uq.id}`, quest: uq }));
  const workingOnItems: ListItem[] = [...bountyItems, ...classItems, ...courseItems, ...questItems];

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50" edges={['top', 'left', 'right']}>
      <PageHeader title="Home" />
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        // Minimal bottom padding so content scrolls flush with the tab bar.
        // The FAB hovers over the bottom-right corner by design — that's a
        // standard FAB pattern; we don't push content above it.
        contentContainerClassName="px-5 md:px-8 pt-2 md:pt-6 pb-4"
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={64}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6D469B" />
        }
      >
        <VStack space="lg" className="max-w-5xl w-full md:mx-auto">

          {/* Welcome */}
          <WelcomeHeader user={user} stats={data?.stats} activeQuestCount={activeQuests.length} />

          {/* Unified active-work section. Classes, courses, and quests live in
              one list (classes first, then courses, then quests); each card
              type has a distinct visual signature. The global "+" FAB at the
              bottom-right of every tab screen is the canonical entry point
              for adding new work — no in-grid tile here. */}
          <VStack space="sm">
            <Heading size="md">What you're working on</Heading>

            {workingOnItems.length > 0 ? (
              <View testID="current-quests-grid" className="flex flex-col md:flex-row md:flex-wrap gap-4">
                {workingOnItems.map((item) => (
                  <View key={item.id} className="md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)] xl:w-[calc(25%-12px)]">
                    {item.kind === 'bounty' && <HomeBountyCard claim={item.claim} />}
                    {item.kind === 'class' && <ClassCard quest={item.quest} />}
                    {item.kind === 'course' && <CourseCard course={item.course} />}
                    {item.kind === 'quest' && <QuestCard quest={item.quest} />}
                  </View>
                ))}
              </View>
            ) : (
              <Pressable testID="empty-state-cta" onPress={startSomething}>
                <Card variant="filled" size="lg" className="items-center py-10">
                  <Ionicons name="add-circle-outline" size={40} color="#6D469B" />
                  <Heading size="sm" className="text-typo-700 mt-3 dark:text-dark-typo-700">Nothing here yet</Heading>
                  <UIText size="sm" className="text-typo-400 mt-1 text-center px-4 dark:text-dark-typo-400">
                    Tap the + button to start a quest, class, or claim a bounty.
                  </UIText>
                </Card>
              </Pressable>
            )}
          </VStack>

          {/* Journal Topics (bug #34: "Could journal topics be included here?").
              Shows the student's topics/tracks on Home so learning moments are
              reachable even with no active quests. Quests/courses are excluded —
              they already appear in "What you're working on" above. */}
          {(() => {
            const homeTopics = (journalTopics || []).filter(
              (t) => t.type === 'topic' || t.type === 'track',
            );
            if (homeTopics.length === 0) return null;
            return (
              <VStack space="sm">
                <HStack className="items-center justify-between">
                  <Heading size="md">Journal topics</Heading>
                  <Pressable onPress={() => router.push('/(app)/(tabs)/journal')} hitSlop={8}>
                    <UIText size="sm" className="text-optio-purple font-poppins-medium">See all</UIText>
                  </Pressable>
                </HStack>
                {/* flex-row flex-wrap WITHOUT a bare `flex` class: on native
                    NativeWind's `flex` => flex:1, which collapses to 0 height in
                    a ScrollView, so the row showed on web but vanished on mobile
                    (bug #34 "shows in browser, not in mobile app"). */}
                <View className="flex-row flex-wrap gap-2">
                  {homeTopics.map((t) => (
                    <Pressable
                      key={t.id}
                      onPress={() => router.push({ pathname: '/(app)/(tabs)/journal', params: { topicId: t.id, topicType: t.type } })}
                      className="flex-row items-center gap-2 px-3 py-2 rounded-full bg-white dark:bg-dark-surface-100 border border-surface-200 dark:border-dark-surface-300"
                    >
                      <Ionicons name={(t.icon as any) || 'folder-outline'} size={14} color={t.color || '#6D469B'} />
                      <UIText size="sm" className="font-poppins-medium">{t.name}</UIText>
                      {typeof t.moment_count === 'number' && t.moment_count > 0 && (
                        <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{t.moment_count}</UIText>
                      )}
                    </Pressable>
                  ))}
                </View>
              </VStack>
            );
          })()}

        </VStack>
      </ScrollView>

      {/* "Start something" FAB — web only. On mobile the center tab button is
          the single entry point, so a duplicate FAB here would be redundant.
          Opens the same role-specific action sheet as the mobile Optio button
          (via useStartSomething), instead of jumping straight to Capture. */}
      {isWeb && (
        <Pressable
          testID="capture-fab"
          onPress={startSomething}
          style={{
            position: 'absolute',
            bottom: 24,
            right: 24,
            width: 56,
            height: 56,
            borderRadius: 28,
            backgroundColor: '#6D469B',
            alignItems: 'center',
            justifyContent: 'center',
            elevation: 6,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: 0.27,
            shadowRadius: 4.65,
          }}
        >
          <Ionicons name="add" size={28} color="white" />
        </Pressable>
      )}

    </SafeAreaView>
  );
}
