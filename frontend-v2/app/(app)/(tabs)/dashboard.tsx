/**
 * Dashboard - Student home screen.
 *
 * Engagement-focused: shows learning rhythm and activity heatmaps,
 * not task completion percentages.
 *
 * Desktop: sidebar (from layout) + wide content with 2-3 column grids.
 * Mobile: single column with bottom tabs.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { View, ScrollView, Image, Pressable, useWindowDimensions, RefreshControl, Modal, Platform } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { useDashboard, useGlobalEngagement } from '@/src/hooks/useDashboard';
import api from '@/src/services/api';
import type { EngagementData } from '@/src/hooks/useDashboard';
import {
  VStack, HStack, Heading, UIText, Button, ButtonText,
  Card, Badge, BadgeText, Divider, Avatar, AvatarFallbackText, AvatarImage,
  Skeleton,
} from '@/src/components/ui';
import { MiniHeatmap } from '@/src/components/engagement/MiniHeatmap';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { PageHeader } from '@/src/components/layouts/MobileHeader';
import { CaptureSheet } from '@/src/components/capture/CaptureSheet';
import { CaptureModal } from '@/src/components/capture/CaptureModal';
import { DiplomaCreditTracker } from '@/src/components/diploma/DiplomaCreditTracker';

// ── Rhythm Explainer Modal ──

const rhythmExplainerContent: { state: string; label: string; icon: keyof typeof Ionicons.glyphMap; color: string; description: string }[] = [
  { state: 'active', label: 'Active', icon: 'flash', color: '#6D469B', description: 'You are learning regularly. Keep going!' },
  { state: 'building', label: 'Building', icon: 'trending-up', color: '#1D4ED8', description: 'You are getting into a groove -- whether starting fresh or returning after a break.' },
  { state: 'resting', label: 'Resting', icon: 'moon', color: '#15803D', description: 'You are taking a break or haven\'t started yet. Rest is part of learning too.' },
];

function RhythmExplainerModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  if (!visible) return null;
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
        <Pressable onPress={(e) => e.stopPropagation?.()} style={{ backgroundColor: '#fff', borderRadius: 20, width: '100%', maxWidth: 480, padding: 24, margin: 20 }}>
          <VStack space="md">
            <HStack className="items-center justify-between">
              <Heading size="lg">Learning Rhythm</Heading>
              <Pressable onPress={onClose} style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="close" size={18} color="#6B7280" />
              </Pressable>
            </HStack>
            <UIText size="sm" className="text-typo-500">
              Your learning rhythm reflects how consistently you engage with learning activities. It is not about speed or quantity -- it is about finding a sustainable pattern that works for you.
            </UIText>
            <Divider />
            <VStack space="sm">
              {rhythmExplainerContent.map((item) => (
                <HStack key={item.state} className="items-center gap-3">
                  <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: item.color + '15', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name={item.icon} size={18} color={item.color} />
                  </View>
                  <VStack className="flex-1">
                    <UIText size="sm" className="font-poppins-semibold" style={{ color: item.color }}>{item.label}</UIText>
                    <UIText size="xs" className="text-typo-500">{item.description}</UIText>
                  </VStack>
                </HStack>
              ))}
            </VStack>
          </VStack>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

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
    <Card variant="elevated" size="sm" className="min-w-0 overflow-hidden" style={{ minHeight: 240, maxHeight: 240 }}>
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

      {/* Description */}
      <UIText size="xs" className="text-typo-500 flex-1" numberOfLines={2}>
        {q?.description || ''}
      </UIText>
    </Card>
    </Pressable>
  );
}

// ── Welcome Header ──

function WelcomeHeader({ user, stats, activeQuestCount }: { user: any; stats: any; activeQuestCount: number }) {
  const initials = `${user?.first_name?.[0] || ''}${user?.last_name?.[0] || ''}`.toUpperCase();

  return (
    <Card testID="welcome-header" variant="elevated" size="lg">
      {/* Top: avatar + greeting */}
      <HStack className="items-center gap-3 md:gap-4">
        <Avatar size="lg" className="flex-shrink-0">
          {user?.avatar_url ? (
            <AvatarImage source={{ uri: user.avatar_url }} />
          ) : (
            <AvatarFallbackText>{initials}</AvatarFallbackText>
          )}
        </Avatar>
        <VStack className="flex-1 min-w-0">
          <Heading testID="welcome-greeting" size="md" className="md:text-2xl" numberOfLines={1}>
            Welcome back, {user?.first_name || 'Student'}!
          </Heading>
          <UIText size="sm" className="text-typo-500 mt-1">
            Keep building your learning journey
          </UIText>
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
  const { data: globalEngagement } = useGlobalEngagement();
  const [refreshing, setRefreshing] = useState(false);
  const [captureVisible, setCaptureVisible] = useState(false);
  const [rhythmExplainerVisible, setRhythmExplainerVisible] = useState(false);
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
  const enrolledCourses = data?.enrolled_courses || [];
  const completedQuests = data?.recent_completed_quests || [];
  const calendarDays = globalEngagement?.calendar?.days || [];

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <PageHeader title="Home" />
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 md:px-8 pt-2 md:pt-6 pb-12"
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6D469B" />
        }
      >
        <VStack space="lg" className="max-w-5xl w-full md:mx-auto">

          {/* Welcome */}
          <WelcomeHeader user={user} stats={data?.stats} activeQuestCount={activeQuests.length} />

          {/* Current Quests */}
          <VStack space="sm">
            <HStack className="items-center justify-between">
              <Heading size="md">Current Quests</Heading>
              <Button variant="link" size="sm" onPress={() => router.push('/(app)/(tabs)/quests')}>
                <ButtonText>Browse All</ButtonText>
              </Button>
            </HStack>

            {activeQuests.length > 0 ? (
              <View testID="current-quests-grid" className="flex flex-col md:flex-row md:flex-wrap gap-4">
                {activeQuests.map((uq: any) => (
                  <View key={uq.id} className="md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]">
                    <QuestCard quest={uq} />
                  </View>
                ))}
              </View>
            ) : (
              <Card variant="filled" size="lg" className="items-center py-10">
                <Ionicons name="rocket-outline" size={40} color="#9CA3AF" />
                <Heading size="sm" className="text-typo-500 mt-3">No quests yet</Heading>
                <UIText size="sm" className="text-typo-400 mt-1">Browse quests to get started</UIText>
                <Button size="sm" className="mt-4" onPress={() => router.push('/(app)/(tabs)/quests')}>
                  <ButtonText>Browse Quests</ButtonText>
                </Button>
              </Card>
            )}
          </VStack>

          {/* Next Up */}
          <NextUpPanel quests={activeQuests} />

          {/* Enrolled Courses */}
          <EnrolledCourses courses={enrolledCourses} />

          {/* Diploma Credit Tracker */}
          <DiplomaCreditTracker />

          {/* Learning Rhythm + Activity Calendar (combined) */}
          <VStack testID="learning-rhythm-section" space="sm">
            <HStack className="items-center justify-between">
              <Heading size="md">Your Learning Rhythm</Heading>
              <Pressable onPress={() => setRhythmExplainerVisible(true)} className="flex-row items-center gap-1">
                <Ionicons name="help-circle-outline" size={16} color="#9CA3AF" />
                <UIText size="xs" className="text-typo-400">Learn more</UIText>
              </Pressable>
            </HStack>
            <Card testID="learning-rhythm-card" variant="elevated" size="md">
              <VStack space="md">
                {/* Header: title + rhythm badge inline */}
                <HStack className="items-center justify-between">
                  <RhythmBadge rhythm={globalEngagement?.rhythm || null} compact />
                  {globalEngagement?.rhythm?.pattern_description ? (
                    <UIText size="xs" className="text-typo-400">
                      {globalEngagement.rhythm.pattern_description}
                    </UIText>
                  ) : null}
                </HStack>

                {/* Activity calendar */}
                <EngagementCalendar
                  days={calendarDays}
                  firstActivityDate={globalEngagement?.calendar?.first_activity_date}
                />
              </VStack>
            </Card>
          </VStack>

          {/* Completed Quests */}
          <CompletedQuests quests={completedQuests} />


        </VStack>
      </ScrollView>

      {/* Quick Capture FAB */}
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

      {/* Capture modal/sheet */}
      {isWeb ? (
        <CaptureModal visible={captureVisible} onClose={() => setCaptureVisible(false)} onCaptured={refetch} />
      ) : (
        <CaptureSheet visible={captureVisible} onClose={() => setCaptureVisible(false)} onCaptured={refetch} />
      )}

      {/* Rhythm explainer */}
      <RhythmExplainerModal visible={rhythmExplainerVisible} onClose={() => setRhythmExplainerVisible(false)} />
    </SafeAreaView>
  );
}
