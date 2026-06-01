/**
 * CourseCard - Compact dashboard card for an enrolled course.
 *
 * Visual signature distinct from QuestCard / ClassCard:
 *   - Solid purple left-edge stripe (class uses pink; quest has none).
 *   - "COURSE · N projects" header label — communicates that this card
 *     contains multiple projects, not a single piece of work.
 *   - Linear progress bar showing projects-done, no engagement metrics,
 *     no subject ring. Courses are about completion through a curriculum.
 */

import React from 'react';
import { Pressable, View } from 'react-native';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  Card, HStack, VStack, UIText,
} from '../ui';

interface CourseCardProps {
  course: any;
}

export function CourseCard({ course }: CourseCardProps) {
  const projectCount = course?.quest_count || course?.quests?.length || 0;
  const progress = course?.progress;
  const completed = progress?.completed_quests || 0;
  const total = progress?.total_quests || projectCount || 0;
  const percent = total > 0 ? Math.min(100, (completed / total) * 100) : 0;

  return (
    <Pressable
      testID={`course-card-${course?.id}`}
      onPress={() => router.push(`/(app)/courses/${course?.id}`)}
      className="md:h-full"
    >
      <Card variant="elevated" size="md" className="overflow-hidden border-l-4 border-optio-purple md:h-full">
        <HStack className="items-center gap-4">
          <View className="w-9 h-9 rounded-lg bg-optio-purple/10 items-center justify-center flex-shrink-0">
            <Ionicons name="layers-outline" size={18} color="#6D469B" />
          </View>
          <VStack className="flex-1 min-w-0">
            <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase tracking-wider">
              Course · {projectCount} {projectCount === 1 ? 'project' : 'projects'}
            </UIText>
            <UIText size="md" className="font-poppins-semibold" numberOfLines={1}>
              {course?.title || 'Course'}
            </UIText>
          </VStack>
        </HStack>

        {total > 0 && (
          <VStack space="xs" className="mt-3">
            <HStack className="items-baseline justify-between">
              <UIText size="xs" className="text-typo-400">
                {completed} of {total} projects
              </UIText>
              <UIText size="xs" className="text-optio-purple font-poppins-medium">
                {Math.round(percent)}%
              </UIText>
            </HStack>
            <View className="h-2 bg-surface-200 rounded-full overflow-hidden">
              <View
                className="h-full bg-optio-purple rounded-full"
                style={{ width: `${percent}%` }}
              />
            </View>
          </VStack>
        )}
      </Card>
    </Pressable>
  );
}
