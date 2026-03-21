/**
 * Parent Dashboard - View and monitor linked children's learning.
 *
 * Desktop: child tabs + full overview with engagement calendar.
 * Mobile: child selector dropdown + scrollable overview.
 */

import React, { useState, useEffect } from 'react';
import { View, ScrollView, Pressable, ActivityIndicator, Platform, useWindowDimensions, Image, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useMyChildren, useChildDashboard, useChildEngagement } from '@/src/hooks/useParent';
import { useFeed } from '@/src/hooks/useFeed';
import { EngagementCalendar } from '@/src/components/engagement/EngagementCalendar';
import { RhythmBadge } from '@/src/components/engagement/RhythmBadge';
import { FeedCard } from '@/src/components/feed/FeedCard';
import { CaptureSheet } from '@/src/components/capture/CaptureSheet';
import { CaptureModal } from '@/src/components/capture/CaptureModal';
import { PillarBadge } from '@/src/components/ui/pillar-badge';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Divider, Avatar, AvatarFallbackText, AvatarImage, Skeleton,
  Badge, BadgeText,
} from '@/src/components/ui';

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
          <Card key={q.id || quest.id} variant="outline" size="md">
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
  const [captureVisible, setCaptureVisible] = useState(false);
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

  const CaptureComponent = isDesktop ? CaptureModal : CaptureSheet;

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#6D469B" />}
      >
        <VStack className="max-w-5xl w-full md:mx-auto px-5 md:px-8 pt-6" space="lg">

          {/* Header */}
          <HStack className="items-center justify-between">
            <Heading size="2xl">Family</Heading>
            <Pressable
              onPress={() => setCaptureVisible(true)}
              style={{
                width: 40, height: 40, borderRadius: 20,
                backgroundColor: '#6D469B', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <Ionicons name="camera-outline" size={20} color="white" />
            </Pressable>
          </HStack>

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

      <CaptureComponent
        visible={captureVisible}
        onClose={() => setCaptureVisible(false)}
        onCaptured={() => refetch()}
      />
    </SafeAreaView>
  );
}
