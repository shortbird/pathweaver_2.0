/**
 * Course Detail - Shows course overview, projects (quests), lessons, and enrollment.
 *
 * Notion-style document layout matching quest detail.
 * Projects listed as expandable sections with nested lessons.
 */

import React, { useState } from 'react';
import { View, ScrollView, Image, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCourseDetail } from '@/src/hooks/useCourses';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Badge, BadgeText, Divider, Skeleton,
} from '@/src/components/ui';

// ── Project (Quest) Item ──

function ProjectItem({ quest, onNavigate }: { quest: any; onNavigate: (questId: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  // Supabase join returns quest data in 'quests' key (not 'quest')
  const q = quest.quests || quest.quest || quest;
  const progress = quest.progress;
  const isCompleted = progress?.is_completed;
  const lessons = quest.lessons || q.curriculum_lessons || [];

  return (
    <Card variant={expanded ? 'elevated' : 'outline'} size="md">
      <VStack space="sm">
        {/* Header */}
        <Pressable onPress={() => setExpanded(!expanded)}>
          <HStack className="items-center gap-3">
            {q.header_image_url || q.image_url ? (
              <Image
                source={{ uri: q.header_image_url || q.image_url }}
                className="w-12 h-12 rounded-lg flex-shrink-0"
                resizeMode="cover"
              />
            ) : (
              <View className="w-12 h-12 rounded-lg bg-optio-purple/10 items-center justify-center flex-shrink-0">
                <Ionicons name="rocket-outline" size={22} color="#6D469B" />
              </View>
            )}
            <VStack className="flex-1 min-w-0">
              <UIText size="sm" className="font-poppins-semibold">{q.title}</UIText>
              {progress && (
                <HStack className="items-center gap-2">
                  {progress.total_xp > 0 && (
                    <UIText size="xs" className="text-typo-400">
                      {progress.earned_xp || 0}/{progress.total_xp} XP
                    </UIText>
                  )}
                  {isCompleted && (
                    <Badge action="success"><BadgeText className="text-green-700">Complete</BadgeText></Badge>
                  )}
                </HStack>
              )}
            </VStack>
            <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#9CA3AF" />
          </HStack>
        </Pressable>

        {/* Expanded: description + lessons + navigate button */}
        {expanded && (
          <VStack space="sm" className="ml-13">
            {q.description && (
              <UIText size="xs" className="text-typo-500">{q.description}</UIText>
            )}

            {/* Lessons */}
            {lessons.length > 0 && (
              <VStack space="xs">
                <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase">Lessons</UIText>
                {lessons.map((lesson: any, idx: number) => (
                  <HStack key={lesson.id || idx} className="items-center gap-2 py-1.5 px-2 rounded-lg bg-surface-50">
                    <View className="w-6 h-6 rounded-full bg-surface-200 items-center justify-center">
                      <UIText size="xs" className="text-typo-500 font-poppins-medium">{idx + 1}</UIText>
                    </View>
                    <UIText size="xs" className="flex-1">{lesson.title}</UIText>
                    <Ionicons name="book-outline" size={14} color="#9CA3AF" />
                  </HStack>
                ))}
              </VStack>
            )}

            <Button size="sm" className="self-start" onPress={() => onNavigate(q.id)}>
              <ButtonText>{isCompleted ? 'Review' : 'Open Project'}</ButtonText>
            </Button>
          </VStack>
        )}
      </VStack>
    </Card>
  );
}

// ── Main Course Detail ──

export default function CourseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { course, loading, error, enroll, refetch } = useCourseDetail(id || null);
  const [enrolling, setEnrolling] = useState(false);

  const handleEnroll = async () => {
    setEnrolling(true);
    try {
      await enroll();
    } finally {
      setEnrolling(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50">
        <VStack className="px-5 md:px-8 pt-6" space="lg">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-8 w-3/4 rounded" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </VStack>
      </SafeAreaView>
    );
  }

  if (error || !course) {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center px-6">
        <Ionicons name="alert-circle-outline" size={48} color="#9CA3AF" />
        <Heading size="md" className="text-typo-500 mt-4">Course not found</Heading>
        <UIText size="sm" className="text-typo-400 mt-2 text-center">{error || 'This course may have been removed.'}</UIText>
        <Button className="mt-6" onPress={() => router.back()}>
          <ButtonText>Go Back</ButtonText>
        </Button>
      </SafeAreaView>
    );
  }

  const isEnrolled = !!course.enrollment;
  const quests = course.quests || [];
  const imageUrl = course.cover_image_url;

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>

        {/* Full-bleed hero */}
        {imageUrl ? (
          <View className="h-72 md:h-96 w-full">
            <Image source={{ uri: imageUrl }} className="w-full h-full" resizeMode="cover" />
            <Pressable
              onPress={() => router.back()}
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-black/40 items-center justify-center"
            >
              <Ionicons name="arrow-back" size={22} color="white" />
            </Pressable>
          </View>
        ) : (
          <View className="h-48 w-full bg-optio-purple/10 items-center justify-center">
            <Ionicons name="school-outline" size={60} color="#6D469B" />
            <Pressable
              onPress={() => router.back()}
              className="absolute top-4 left-4 w-10 h-10 rounded-full bg-surface-200 items-center justify-center"
            >
              <Ionicons name="arrow-back" size={22} color="#374151" />
            </Pressable>
          </View>
        )}

        {/* Constrained content */}
        <VStack className="max-w-4xl w-full md:mx-auto">
          <VStack className="px-5 md:px-8 pt-6 pb-12" space="lg">

            {/* Title + meta */}
            <VStack space="sm">
              <Heading size="2xl">{course.title}</Heading>
              <HStack className="items-center gap-3 flex-wrap">
                {course.estimated_hours && (
                  <HStack className="items-center gap-1">
                    <Ionicons name="time-outline" size={16} color="#9CA3AF" />
                    <UIText size="sm" className="text-typo-400">{course.estimated_hours} hours</UIText>
                  </HStack>
                )}
                {quests.length > 0 && (
                  <HStack className="items-center gap-1">
                    <Ionicons name="rocket-outline" size={16} color="#9CA3AF" />
                    <UIText size="sm" className="text-typo-400">{quests.length} project{quests.length !== 1 ? 's' : ''}</UIText>
                  </HStack>
                )}
                {course.age_range && (
                  <Badge action="muted"><BadgeText className="text-typo-500">{course.age_range}</BadgeText></Badge>
                )}
                {course.guidance_level && (
                  <Badge action="info"><BadgeText className="text-blue-700 capitalize">{course.guidance_level}</BadgeText></Badge>
                )}
              </HStack>
            </VStack>

            {/* Description */}
            <UIText className="text-typo-500 leading-6">{course.description}</UIText>

            {/* Learning outcomes */}
            {course.learning_outcomes?.length > 0 && (
              <VStack space="sm">
                <Heading size="md">What You'll Learn</Heading>
                <Card variant="filled" size="md">
                  <VStack space="sm">
                    {course.learning_outcomes.map((outcome: string, idx: number) => (
                      <HStack key={idx} className="items-start gap-2">
                        <Ionicons name="checkmark-circle" size={18} color="#6D469B" className="mt-0.5" />
                        <UIText size="sm" className="flex-1 text-typo-500">{outcome}</UIText>
                      </HStack>
                    ))}
                  </VStack>
                </Card>
              </VStack>
            )}

            {/* Final deliverable */}
            {course.final_deliverable && (
              <Card variant="outline" size="md">
                <HStack className="items-start gap-3">
                  <View className="w-10 h-10 rounded-lg bg-optio-pink/10 items-center justify-center flex-shrink-0">
                    <Ionicons name="ribbon-outline" size={20} color="#EF597B" />
                  </View>
                  <VStack className="flex-1">
                    <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase">Final Deliverable</UIText>
                    <UIText size="sm" className="text-typo-500">{course.final_deliverable}</UIText>
                  </VStack>
                </HStack>
              </Card>
            )}

            {/* Enrollment CTA */}
            {!isEnrolled && (
              <Card variant="elevated" size="lg" className="items-center">
                <VStack space="md" className="items-center w-full">
                  <Ionicons name="school" size={32} color="#6D469B" />
                  <Heading size="md">Ready to enroll?</Heading>
                  <UIText size="sm" className="text-typo-500 text-center">
                    Start this course to access all projects and lessons.
                  </UIText>
                  <Button size="lg" className="w-full" onPress={handleEnroll} loading={enrolling}>
                    <ButtonText>Enroll in Course</ButtonText>
                  </Button>
                </VStack>
              </Card>
            )}

            {/* Course progress (enrolled) */}
            {isEnrolled && course.progress && (
              <Card variant="filled" size="md">
                <HStack className="items-center justify-between">
                  <VStack>
                    <UIText size="sm" className="font-poppins-medium">Course Progress</UIText>
                    <UIText size="xs" className="text-typo-400">
                      {course.progress.completed_quests} of {course.progress.total_quests} projects complete
                    </UIText>
                  </VStack>
                  <View className="w-12 h-12 rounded-full border-4 border-optio-purple items-center justify-center">
                    <UIText size="xs" className="font-poppins-bold text-optio-purple">
                      {Math.round(course.progress.percentage)}%
                    </UIText>
                  </View>
                </HStack>
              </Card>
            )}

            {/* Projects list */}
            {quests.length > 0 && (
              <VStack space="sm">
                <Heading size="md">Projects</Heading>
                {quests
                  .sort((a: any, b: any) => (a.sequence_order || 0) - (b.sequence_order || 0))
                  .map((q: any) => (
                    <ProjectItem
                      key={q.id || q.quest_id}
                      quest={q}
                      onNavigate={(questId) => router.push(`/(app)/quests/${questId}` as any)}
                    />
                  ))}
              </VStack>
            )}

            {/* Academic alignment */}
            {course.academic_alignment?.length > 0 && (
              <VStack space="sm">
                <Heading size="sm">Academic Alignment</Heading>
                <HStack className="flex-wrap gap-2">
                  {course.academic_alignment.map((subject: string, idx: number) => (
                    <Badge key={idx} action="muted">
                      <BadgeText className="text-typo-500">{subject}</BadgeText>
                    </Badge>
                  ))}
                </HStack>
              </VStack>
            )}

          </VStack>
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
