/**
 * ObserverStudentsList - the "Students" segment of the observer's feed: one
 * row per student they follow, with the unread dot and the door to the
 * student's page. Lived inside app/(app)/(tabs)/feed.tsx until 2026-09-15,
 * when the feed screen was split by role.
 */

import React from 'react';
import { View, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useObserverStudents } from '@/src/hooks/useObserverStudents';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import {
  VStack, HStack, Heading, UIText, Card,
  Avatar, AvatarFallbackText, AvatarImage, Skeleton,
} from '@/src/components/ui';
import { formatRelativeTime } from '@/src/utils/timeAgo';

export function ObserverStudentsList({ isDesktop }: { isDesktop: boolean }) {
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
                    {s.last_active_at ? `Active ${formatRelativeTime(s.last_active_at)}` : 'No activity yet'}
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
