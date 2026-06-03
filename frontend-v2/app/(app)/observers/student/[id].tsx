/**
 * Observer per-student overview - read-only view of one linked student.
 *
 * Mirrors the V1 ObserverStudentOverviewPage in spirit: feed scoped to the
 * student, recent activity, and a "back to students" affordance.
 */

import React from 'react';
import { View, ScrollView, Pressable, Platform, useWindowDimensions, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFeed } from '@/src/hooks/useFeed';
import { useObserverStudents } from '@/src/hooks/useObserverStudents';
import { FeedCard } from '@/src/components/feed/FeedCard';
import {
  VStack, HStack, Heading, UIText, Card, Skeleton,
  Avatar, AvatarFallbackText, AvatarImage,
} from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

const DESKTOP_BREAKPOINT = 768;

export default function ObserverStudentOverviewScreen() {
  const c = useThemeColors();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { width } = useWindowDimensions();
  const isDesktop = Platform.OS === 'web' && width >= DESKTOP_BREAKPOINT;

  // Pull the student's metadata from the linked-students list (cached)
  const { students } = useObserverStudents(true);
  const student = students.find((s) => s.id === id);

  const { items, loading } = useFeed({ studentId: id });

  const initials = student
    ? `${student.first_name?.[0] || ''}${student.last_name?.[0] || ''}`.toUpperCase()
      || (student.display_name?.[0] || '?').toUpperCase()
    : '?';
  const name = student
    ? (student.display_name || `${student.first_name || ''} ${student.last_name || ''}`.trim() || 'Student')
    : '';

  return (
    <SafeAreaView className="flex-1 bg-surface-50 dark:bg-dark-surface-50">
      {/* Header */}
      <View className="px-5 pt-4 pb-2">
        <HStack className="items-center gap-3">
          <Pressable
            onPress={() => router.back()}
            className="w-10 h-10 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center"
          >
            <Ionicons name="chevron-back" size={20} color={c.icon} />
          </Pressable>
          <Avatar size="md">
            {student?.avatar_url ? (
              <AvatarImage source={{ uri: student.avatar_url }} />
            ) : (
              <AvatarFallbackText>{initials}</AvatarFallbackText>
            )}
          </Avatar>
          <VStack className="flex-1 min-w-0">
            <Heading size="lg" numberOfLines={1}>{name || 'Student'}</Heading>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">Recent activity</UIText>
          </VStack>
        </HStack>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        <VStack space="md" className={isDesktop ? 'max-w-2xl w-full mx-auto' : ''}>
          {loading ? (
            <VStack space="sm">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-32 rounded-xl" />)}
            </VStack>
          ) : items.length > 0 ? (
            items.map((item) => <FeedCard key={item.id} item={item} />)
          ) : (
            <Card variant="filled" size="lg" className="items-center py-10 mt-4">
              <Ionicons name="newspaper-outline" size={40} color={c.iconMuted} />
              <Heading size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-3">No activity yet</Heading>
              <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 mt-1 text-center px-4">
                When {name || 'this student'} captures a moment or completes a task, it'll show up here.
              </UIText>
            </Card>
          )}
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
