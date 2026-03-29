/**
 * Course Catalog - Browse and enroll in courses. Web only.
 */

import React from 'react';
import { View, Image, Platform, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useCourseCatalog } from '@/src/hooks/useCourses';
import {
  VStack, HStack, Heading, UIText, Card, Button, ButtonText,
  Skeleton, Input, InputField, InputSlot, InputIcon, Badge, BadgeText,
} from '@/src/components/ui';

const statusBadgeConfig: Record<string, { action: string; label: string }> = {
  draft: { action: 'muted', label: 'Draft' },
  archived: { action: 'warning', label: 'Archived' },
  published: { action: 'success', label: 'Published' },
};

function CourseCard({ course, isSuperadmin }: { course: any; isSuperadmin: boolean }) {
  const imageUrl = course.cover_image_url;
  const statusConfig = statusBadgeConfig[course.status] || null;

  return (
    <Card variant="elevated" size="sm" className="overflow-hidden h-full">
      <Pressable onPress={() => router.push(`/(app)/courses/${course.id}`)}>
        {imageUrl ? (
          <View className="-mx-3 -mt-3 mb-3">
            <Image source={{ uri: imageUrl }} className="w-full h-40 rounded-t-xl" resizeMode="cover" />
            {isSuperadmin && statusConfig && (
              <View className="absolute top-2 right-2">
                <Badge action={statusConfig.action as any}><BadgeText>{statusConfig.label}</BadgeText></Badge>
              </View>
            )}
          </View>
        ) : (
          <View className="-mx-3 -mt-3 mb-3 h-40 bg-optio-purple/10 items-center justify-center rounded-t-xl">
            <Ionicons name="school-outline" size={40} color="#6D469B" />
            {isSuperadmin && statusConfig && (
              <View className="absolute top-2 right-2">
                <Badge action={statusConfig.action as any}><BadgeText>{statusConfig.label}</BadgeText></Badge>
              </View>
            )}
          </View>
        )}
        <VStack space="sm" className="flex-1 min-h-[100px]">
          <Heading size="sm" numberOfLines={1}>{course.title}</Heading>
          <UIText size="xs" className="text-typo-500" numberOfLines={2}>
            {course.description}
          </UIText>
          <View className="flex-1" />
          <HStack className="items-center gap-2 flex-wrap">
            {course.estimated_hours && (
              <HStack className="items-center gap-1">
                <Ionicons name="time-outline" size={12} color="#9CA3AF" />
                <UIText size="xs" className="text-typo-400">{course.estimated_hours}h</UIText>
              </HStack>
            )}
            {course.age_range && (
              <HStack className="items-center gap-1">
                <Ionicons name="people-outline" size={12} color="#9CA3AF" />
                <UIText size="xs" className="text-typo-400">{course.age_range}</UIText>
              </HStack>
            )}
            {course.quest_count != null && (
              <HStack className="items-center gap-1">
                <Ionicons name="rocket-outline" size={12} color="#9CA3AF" />
                <UIText size="xs" className="text-typo-400">{course.quest_count} project{course.quest_count !== 1 ? 's' : ''}</UIText>
              </HStack>
            )}
          </HStack>
        </VStack>
      </Pressable>

      {isSuperadmin && (
        <HStack className="mt-3 gap-2">
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onPress={() => router.push(`/(app)/courses/${course.id}` as any)}
          >
            <ButtonText>
              <HStack className="items-center gap-1">
                <Ionicons name="eye-outline" size={14} color="#6D469B" />
                <UIText size="xs" className="font-poppins-medium text-optio-purple"> View</UIText>
              </HStack>
            </ButtonText>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="flex-1"
            onPress={() => router.push(`/(app)/courses/${course.id}/edit` as any)}
          >
            <ButtonText>
              <HStack className="items-center gap-1">
                <Ionicons name="create-outline" size={14} color="#6D469B" />
                <UIText size="xs" className="font-poppins-medium text-optio-purple"> Edit</UIText>
              </HStack>
            </ButtonText>
          </Button>
        </HStack>
      )}
    </Card>
  );
}

export default function CoursesScreen() {
  if (Platform.OS !== 'web') {
    return (
      <SafeAreaView className="flex-1 bg-surface-50 items-center justify-center">
        <Ionicons name="desktop-outline" size={40} color="#9CA3AF" />
        <Heading size="sm" className="text-typo-500 mt-3">Desktop Only</Heading>
        <UIText size="sm" className="text-typo-400 mt-1">Courses are available on desktop.</UIText>
      </SafeAreaView>
    );
  }

  const { courses, loading, search, setSearch, isSuperadmin } = useCourseCatalog();

  return (
    <SafeAreaView className="flex-1 bg-surface-50">
      <ScrollView className="flex-1" contentContainerClassName="px-5 md:px-8 pt-6 pb-12" showsVerticalScrollIndicator={false}>
        <VStack space="lg" className="max-w-5xl w-full md:mx-auto">

          <VStack space="sm">
            <Heading size="2xl">Course Catalog</Heading>
            <UIText className="text-typo-500">Structured learning paths with projects and lessons</UIText>
          </VStack>

          <Input variant="rounded" size="lg">
            <InputSlot className="ml-3">
              <InputIcon as="search-outline" />
            </InputSlot>
            <InputField placeholder="Search courses..." value={search} onChangeText={setSearch} />
          </Input>

          {loading ? (
            <View className="flex flex-row flex-wrap gap-4">
              {[1, 2, 3, 4].map((i) => (
                <View key={i} className="w-full md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]">
                  <Skeleton className="h-72 rounded-xl" />
                </View>
              ))}
            </View>
          ) : courses.length > 0 ? (
            <View className="flex flex-col md:flex-row md:flex-wrap gap-4">
              {courses.map((c) => (
                <View key={c.id} className="md:w-[calc(50%-8px)] lg:w-[calc(33.333%-11px)]">
                  <CourseCard course={c} isSuperadmin={isSuperadmin} />
                </View>
              ))}
            </View>
          ) : (
            <Card variant="filled" size="lg" className="items-center py-10">
              <Ionicons name="school-outline" size={40} color="#9CA3AF" />
              <Heading size="sm" className="text-typo-500 mt-3">No courses available</Heading>
              <UIText size="sm" className="text-typo-400 mt-1">Check back later for new courses</UIText>
            </Card>
          )}
        </VStack>
      </ScrollView>
    </SafeAreaView>
  );
}
