/**
 * Dashboard - Student home screen.
 *
 * Engagement-focused: shows learning rhythm and activity heatmaps,
 * not task completion percentages.
 *
 * Desktop: sidebar (from layout) + wide content with 2-3 column grids.
 * Mobile: single column with bottom tabs.
 */

import React, { useEffect, useState } from 'react';
import { View, ScrollView, Image, Pressable, useWindowDimensions, RefreshControl } from 'react-native';
import { router } from 'expo-router';
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
    <Pressable onPress={() => router.push(`/(app)/quests/${q?.id}`)}>
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
    <Card variant="elevated" size="lg">
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
          <Heading size="md" className="md:text-2xl" numberOfLines={1}>
            Welcome back, {user?.first_name || 'Student'}!
          </Heading>
          <UIText size="sm" className="text-typo-500 mt-1">
            Keep building your learning journey
          </UIText>
        </VStack>
      </HStack>

      {/* Bottom: stats */}
      <Divider className="mt-4 mb-3" />
      <HStack className="justify-around">
        <VStack className="items-center">
          <UIText size="lg" className="font-poppins-bold text-optio-purple">
            {stats?.completed_quests_count || 0}
          </UIText>
          <UIText size="xs" className="text-typo-400">Completed Quests</UIText>
        </VStack>
        <VStack className="items-center">
          <UIText size="lg" className="font-poppins-bold text-optio-pink">
            {(stats?.total_xp || user?.total_xp || 0).toLocaleString()}
          </UIText>
          <UIText size="xs" className="text-typo-400">Total XP</UIText>
        </VStack>
        <VStack className="items-center">
          <UIText size="lg" className="font-poppins-bold text-pillar-stem">
            {activeQuestCount}
          </UIText>
          <UIText size="xs" className="text-typo-400">Active Quests</UIText>
        </VStack>
      </HStack>
    </Card>
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

// ── Main Dashboard ──

export default function DashboardScreen() {
  const { user } = useAuthStore();
  const { data, loading, refetch } = useDashboard();
  const { data: globalEngagement } = useGlobalEngagement();
  const [refreshing, setRefreshing] = useState(false);

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
  const completedQuests = data?.recent_completed_quests || [];
  const calendarDays = globalEngagement?.calendar?.days || [];

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView
        className="flex-1"
        contentContainerClassName="px-5 md:px-8 pt-6 pb-12"
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
              <Button variant="link" size="sm">
                <ButtonText>Browse All</ButtonText>
              </Button>
            </HStack>

            {activeQuests.length > 0 ? (
              <View className="flex flex-col md:flex-row md:flex-wrap gap-4">
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
                <Button size="sm" className="mt-4">
                  <ButtonText>Browse Quests</ButtonText>
                </Button>
              </Card>
            )}
          </VStack>

          {/* Learning Rhythm + Activity Calendar (combined) */}
          <VStack space="sm">
            <Heading size="md">Your Learning Rhythm</Heading>
            <Card variant="elevated" size="md">
              <VStack space="md">
                {/* Header: title + rhythm badge inline */}
                <HStack className="items-center justify-between">
                  <RhythmBadge rhythm={globalEngagement?.rhythm || null} compact />
                  {globalEngagement?.rhythm?.pattern_description && (
                    <UIText size="xs" className="text-typo-400">
                      {globalEngagement.rhythm.pattern_description}
                    </UIText>
                  )}
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
    </SafeAreaView>
  );
}
