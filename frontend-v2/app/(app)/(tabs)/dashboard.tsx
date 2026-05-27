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
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { useDashboard } from '@/src/hooks/useDashboard';
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
import { CaptureModal } from '@/src/components/capture/CaptureModal';
import { DiplomaCreditTracker } from '@/src/components/diploma/DiplomaCreditTracker';
import { ScrollToTopFab } from '@/src/components/ui/ScrollToTopFab';
import { CreateClassSheet } from '@/src/components/class/CreateClassSheet';
import { ClassCard } from '@/src/components/class/ClassCard';

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
    <Pressable testID={`quest-card-${q?.id}`} onPress={() => router.push(`/(app)/quests/${q?.id}`)}>
    <Card variant="elevated" size="sm" className="min-w-0 overflow-hidden">
      {/* Quest image */}
      {imageUrl ? (
        <View className="h-28 -mx-3 -mt-3 mb-3 overflow-hidden rounded-t-xl">
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
        <UIText size="xs" className="text-typo-500" numberOfLines={2}>
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
            backgroundColor: '#FFFFFF',
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
          <UIText size="xs" className="text-typo-400 mt-0.5">Tap your photo to open your profile</UIText>
        </VStack>
      </HStack>

      {/* Bottom: stats */}
      <Divider className="mt-4 mb-3" />
      <HStack testID="hero-stats" className="justify-around">
        <VStack className="items-center">
          <UIText testID="stat-completed-quests" size="lg" className="font-poppins-bold text-optio-purple">
            {stats?.completed_quests_count || 0}
          </UIText>
          <UIText size="xs" className="text-typo-400">Completed Quests</UIText>
        </VStack>
        <VStack className="items-center">
          <UIText testID="stat-total-xp" size="lg" className="font-poppins-bold text-optio-pink">
            {(stats?.total_xp || user?.total_xp || 0).toLocaleString()}
          </UIText>
          <UIText size="xs" className="text-typo-400">Total XP</UIText>
        </VStack>
        <VStack className="items-center">
          <UIText testID="stat-active-quests" size="lg" className="font-poppins-bold text-pillar-stem">
            {activeQuestCount}
          </UIText>
          <UIText size="xs" className="text-typo-400">Active Quests</UIText>
        </VStack>
      </HStack>
    </Card>
  );
}

// ── Enrolled Courses ──

function EnrolledCourses({ courses }: { courses: any[] }) {
  if (!courses || courses.length === 0) return null;

  return (
    <VStack space="sm">
      <HStack className="items-center justify-between">
        <Heading size="md">Your Courses</Heading>
        <Button variant="link" size="sm" onPress={() => router.push('/(app)/(tabs)/courses')}>
          <ButtonText>View All</ButtonText>
        </Button>
      </HStack>
      <View className="flex flex-col md:flex-row md:flex-wrap gap-4">
        {courses.map((course: any) => {
          const imageUrl = course.cover_image_url;
          const projectCount = course.quest_count || course.quests?.length || 0;
          const progress = course.progress;
          return (
            <Pressable
              key={course.id}
              onPress={() => router.push(`/(app)/courses/${course.id}`)}
              className="md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]"
            >
              <Card variant="elevated" size="sm" className="overflow-hidden" style={{ minHeight: 180 }}>
                {imageUrl ? (
                  <View className="h-24 -mx-3 -mt-3 mb-3 overflow-hidden rounded-t-xl">
                    <Image
                      source={{ uri: imageUrl }}
                      className="w-full h-full"
                      resizeMode="cover"
                    />
                  </View>
                ) : (
                  <View className="h-24 -mx-3 -mt-3 mb-3 bg-gradient-to-r from-optio-purple to-optio-pink rounded-t-xl items-center justify-center">
                    <Ionicons name="book-outline" size={32} color="white" />
                  </View>
                )}
                <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>
                  {course.title}
                </UIText>
                <HStack className="items-center gap-2 mt-1">
                  <Ionicons name="layers-outline" size={14} color="#9CA3AF" />
                  <UIText size="xs" className="text-typo-400">
                    {projectCount} {projectCount === 1 ? 'project' : 'projects'}
                  </UIText>
                  {progress && (
                    <>
                      <View className="w-1 h-1 rounded-full bg-typo-300" />
                      <UIText size="xs" className="text-optio-purple font-poppins-medium">
                        {progress.completed_quests || 0}/{progress.total_quests || 0} done
                      </UIText>
                    </>
                  )}
                </HStack>
              </Card>
            </Pressable>
          );
        })}
      </View>
    </VStack>
  );
}

// ── Completed Quests ──

function CompletedQuests({ quests }: { quests: any[] }) {
  if (quests.length === 0) return null;

  return (
    <VStack space="sm">
      <Heading size="md">Completed Quests</Heading>
      <VStack space="sm">
        {quests.map((uq: any) => (
          <Card key={uq.id} variant="outline" size="sm">
            <HStack className="items-center gap-3">
              <View className="w-10 h-10 rounded-lg bg-green-50 items-center justify-center">
                <Ionicons name="checkmark-circle" size={22} color="#16A34A" />
              </View>
              <VStack className="flex-1">
                <UIText size="sm" className="font-poppins-medium">
                  {uq.quests?.title || 'Quest'}
                </UIText>
                <UIText size="xs" className="text-typo-400">
                  Completed {uq.completed_at ? new Date(uq.completed_at).toLocaleDateString() : ''}
                </UIText>
              </VStack>
            </HStack>
          </Card>
        ))}
      </VStack>
    </VStack>
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

// ── Next Up Tasks ──

function NextUpPanel({ quests }: { quests: any[] }) {
  const [tasks, setTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (quests.length === 0) { setLoading(false); return; }
    (async () => {
      try {
        const results = await Promise.allSettled(
          quests.slice(0, 5).map(async (uq: any) => {
            const q = uq.quests;
            if (!q?.id) return null;
            const { data } = await api.get(`/api/quests/${q.id}`);
            const questData = data.quest || data;
            const allTasks = questData.quest_tasks || [];
            const nextTask = allTasks.find((t: any) => !t.is_completed);
            if (!nextTask) return null;
            return { ...nextTask, quest_title: q.title, quest_id: q.id };
          })
        );
        const validTasks = results
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled' && r.value !== null)
          .map((r) => r.value);
        setTasks(validTasks);
      } catch {
        // Non-critical
      } finally {
        setLoading(false);
      }
    })();
  }, [quests]);

  if (loading) {
    return (
      <VStack space="sm">
        <Heading size="md">Next Up</Heading>
        <Skeleton className="h-20 rounded-xl" />
        <Skeleton className="h-20 rounded-xl" />
      </VStack>
    );
  }

  if (tasks.length === 0) return null;

  const pillarColors: Record<string, string> = {
    stem: 'bg-pillar-stem',
    art: 'bg-pillar-art',
    communication: 'bg-pillar-communication',
    civics: 'bg-pillar-civics',
    wellness: 'bg-pillar-wellness',
  };

  return (
    <VStack space="sm">
      <HStack className="items-center gap-2">
        <Ionicons name="flash-outline" size={20} color="#6D469B" />
        <Heading size="md">Next Up</Heading>
      </HStack>
      <VStack space="sm">
        {tasks.map((task) => (
          <Pressable key={task.id} onPress={() => router.push(`/(app)/quests/${task.quest_id}`)}>
            <Card variant="elevated" size="sm">
              <HStack className="items-center gap-3">
                <View className={`w-1.5 h-12 rounded-full ${pillarColors[task.pillar] || pillarColors.stem}`} />
                <VStack className="flex-1 min-w-0">
                  <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                    {task.title}
                  </UIText>
                  <HStack className="items-center gap-2 mt-0.5">
                    <UIText size="xs" className="text-typo-400" numberOfLines={1}>
                      {task.quest_title}
                    </UIText>
                    <View className="w-1 h-1 rounded-full bg-typo-300" />
                    <UIText size="xs" className="text-optio-purple font-poppins-medium">
                      {task.xp_value || task.xp_amount || 0} XP
                    </UIText>
                  </HStack>
                </VStack>
                <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
              </HStack>
            </Card>
          </Pressable>
        ))}
      </VStack>
    </VStack>
  );
}

// ── Main Dashboard ──

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const { data, loading, refetch } = useDashboard();
  const [refreshing, setRefreshing] = useState(false);
  const [captureVisible, setCaptureVisible] = useState(false);
  const [classSheetVisible, setClassSheetVisible] = useState(false);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const isWeb = Platform.OS === 'web';

  // Refetch when screen regains focus (e.g. after leaving a quest)
  useFocusEffect(
    useCallback(() => {
      if (data) refetch();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  if (loading && !data) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <DashboardSkeleton />
      </SafeAreaView>
    );
  }

  const activeQuests = data?.active_quests || [];
  const classes = activeQuests.filter((uq: any) => (uq.quests?.quest_type || uq.quest_type) === 'class');
  const nonClassQuests = activeQuests.filter((uq: any) => (uq.quests?.quest_type || uq.quest_type) !== 'class');
  const enrolledCourses = data?.enrolled_courses || [];
  const completedQuests = data?.recent_completed_quests || [];

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <PageHeader title="Home" />
      <ScrollView
        ref={scrollRef}
        className="flex-1"
        contentContainerClassName="px-5 md:px-8 pt-2 md:pt-6 pb-12"
        showsVerticalScrollIndicator={false}
        onScroll={(e) => setShowScrollTop(e.nativeEvent.contentOffset.y > 600)}
        scrollEventThrottle={64}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6D469B" />
        }
      >
        <VStack space="lg" className="max-w-5xl w-full md:mx-auto">

          {/* Welcome */}
          <WelcomeHeader user={user} stats={data?.stats} activeQuestCount={activeQuests.length} />

          {/* Start a Class CTA — Optio logo on the left (matches the icon used
              in the center capture tab and on the auth screens). */}
          <Pressable testID="start-a-class-cta" onPress={() => setClassSheetVisible(true)}>
            <Card variant="elevated" size="md" className="border-2 border-optio-pink/30 bg-gradient-to-r from-purple-50 to-pink-50">
              <HStack className="items-center gap-3">
                <Image
                  source={require('@/assets/images/icon.png')}
                  style={{ width: 48, height: 48, borderRadius: 24 }}
                  resizeMode="cover"
                />
                <VStack className="flex-1 min-w-0">
                  <Heading size="sm">Start a Class</Heading>
                  <UIText size="xs" className="text-typo-500">
                    Earn high school credit for a passion project
                  </UIText>
                </VStack>
                <Ionicons name="chevron-forward" size={20} color="#6D469B" />
              </HStack>
            </Card>
          </Pressable>

          {/* My Classes */}
          {classes.length > 0 && (
            <VStack space="sm">
              <Heading size="md">My Classes</Heading>
              <View className="flex flex-col md:flex-row md:flex-wrap gap-4">
                {classes.map((uq: any) => (
                  <View key={uq.id} className="md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]">
                    <ClassCard quest={uq} />
                  </View>
                ))}
              </View>
            </VStack>
          )}

          {/* Current Quests */}
          <VStack space="sm">
            <HStack className="items-center justify-between">
              <Heading size="md">Current Quests</Heading>
              <Button variant="link" size="sm" onPress={() => router.push('/(app)/(tabs)/quests')}>
                <ButtonText>Browse All</ButtonText>
              </Button>
            </HStack>

            {nonClassQuests.length > 0 ? (
              <View testID="current-quests-grid" className="flex flex-col md:flex-row md:flex-wrap gap-4">
                {nonClassQuests.map((uq: any) => (
                  <View key={uq.id} className="md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]">
                    <QuestCard quest={uq} />
                  </View>
                ))}
              </View>
            ) : classes.length === 0 ? (
              <Card variant="filled" size="lg" className="items-center py-10">
                <Ionicons name="rocket-outline" size={40} color="#9CA3AF" />
                <Heading size="sm" className="text-typo-500 mt-3">No quests yet</Heading>
                <UIText size="sm" className="text-typo-400 mt-1">Browse quests to get started</UIText>
                <Button size="sm" className="mt-4" onPress={() => router.push('/(app)/(tabs)/quests')}>
                  <ButtonText>Browse Quests</ButtonText>
                </Button>
              </Card>
            ) : null}
          </VStack>

          {/* Next Up */}
          <NextUpPanel quests={activeQuests} />

          {/* Enrolled Courses */}
          <EnrolledCourses courses={enrolledCourses} />

          {/* Diploma Credit Tracker */}
          <DiplomaCreditTracker />

          {/* Completed Quests */}
          <CompletedQuests quests={completedQuests} />


        </VStack>
      </ScrollView>

      {/* Quick Capture FAB — web only. On mobile the center tab button is the
          single capture entry point, so a duplicate FAB here would be redundant
          (and visually compete with it). */}
      {isWeb && (
        <>
          <Pressable
            testID="capture-fab"
            onPress={() => setCaptureVisible(true)}
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
          <CaptureModal visible={captureVisible} onClose={() => setCaptureVisible(false)} onCaptured={refetch} />
        </>
      )}

      <ScrollToTopFab
        visible={showScrollTop}
        onPress={() => scrollRef.current?.scrollTo({ y: 0, animated: true })}
      />

      <CreateClassSheet
        visible={classSheetVisible}
        onClose={() => setClassSheetVisible(false)}
        onCreated={() => { refetch(); }}
      />
    </SafeAreaView>
  );
}
