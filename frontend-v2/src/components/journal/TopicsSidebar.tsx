/**
 * TopicsSidebar - Left sidebar showing interest tracks, quests, and courses.
 * Desktop: always visible. Mobile: shown as a list view.
 */

import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Heading, Divider } from '../ui';
import type { UnifiedTopic } from '@/src/hooks/useJournal';

const iconMap: Record<string, keyof typeof Ionicons.glyphMap> = {
  folder: 'folder-outline',
  star: 'star-outline',
  book: 'book-outline',
  code: 'code-slash-outline',
  paint: 'color-palette-outline',
  music: 'musical-notes-outline',
  science: 'flask-outline',
  heart: 'heart-outline',
  globe: 'globe-outline',
  default: 'folder-outline',
};

interface TopicsSidebarProps {
  topics: UnifiedTopic[];
  selectedId: string | null;
  selectedType: 'unassigned' | 'topic' | 'track' | 'quest';
  onSelectUnassigned: () => void;
  onSelectTopic: (id: string, type: 'topic' | 'quest' | 'track') => void;
  unassignedCount: number;
}

function TopicItem({
  topic,
  isSelected,
  onPress,
}: {
  topic: UnifiedTopic;
  isSelected: boolean;
  onPress: () => void;
}) {
  const iconName = iconMap[topic.icon || 'default'] || iconMap.default;

  return (
    <Pressable
      onPress={onPress}
      className={`flex-row items-center gap-3 px-3 py-2.5 rounded-xl ${
        isSelected ? 'bg-optio-purple/10' : 'active:bg-surface-100'
      }`}
    >
      <View
        className="w-8 h-8 rounded-lg items-center justify-center"
        style={{ backgroundColor: (topic.color || '#6D469B') + '20' }}
      >
        <Ionicons
          name={topic.type === 'quest' ? 'rocket-outline' : iconName}
          size={16}
          color={topic.color || '#6D469B'}
        />
      </View>
      <VStack className="flex-1 min-w-0">
        <UIText
          size="sm"
          className={isSelected ? 'font-poppins-semibold text-optio-purple' : 'text-typo'}
          numberOfLines={1}
        >
          {topic.name}
        </UIText>
        {topic.moment_count != null && (
          <UIText size="xs" className="text-typo-400">
            {topic.moment_count} moment{topic.moment_count !== 1 ? 's' : ''}
          </UIText>
        )}
      </VStack>
    </Pressable>
  );
}

export function TopicsSidebar({
  topics,
  selectedId,
  selectedType,
  onSelectUnassigned,
  onSelectTopic,
  unassignedCount,
}: TopicsSidebarProps) {
  const [sectionsCollapsed, setSectionsCollapsed] = useState<Record<string, boolean>>({});

  const tracks = topics.filter((t) => t.type === 'topic' || t.type === 'track');
  const quests = topics.filter((t) => t.type === 'quest');
  const courses = topics.filter((t) => t.type === 'course');

  const toggleSection = (key: string) => {
    setSectionsCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <ScrollView className="flex-1" showsVerticalScrollIndicator={false}>
      <VStack space="xs" className="py-2">
        {/* Unassigned */}
        <Pressable
          onPress={onSelectUnassigned}
          className={`flex-row items-center gap-3 px-3 py-2.5 rounded-xl ${
            selectedType === 'unassigned' ? 'bg-optio-purple/10' : 'active:bg-surface-100'
          }`}
        >
          <View className="w-8 h-8 rounded-lg bg-amber-50 items-center justify-center">
            <Ionicons name="albums-outline" size={16} color="#B45309" />
          </View>
          <UIText
            size="sm"
            className={selectedType === 'unassigned' ? 'font-poppins-semibold text-optio-purple' : 'text-typo'}
          >
            Unassigned
          </UIText>
          {unassignedCount > 0 && (
            <View className="bg-amber-100 px-2 py-0.5 rounded-full ml-auto">
              <UIText size="xs" className="text-amber-700 font-poppins-medium">
                {unassignedCount}
              </UIText>
            </View>
          )}
        </Pressable>

        <Divider className="my-2" />

        {/* Interest Tracks */}
        {tracks.length > 0 && (
          <VStack>
            <Pressable
              onPress={() => toggleSection('tracks')}
              className="flex-row items-center justify-between px-3 py-1"
            >
              <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase">
                Topics
              </UIText>
              <Ionicons
                name={sectionsCollapsed.tracks ? 'chevron-forward' : 'chevron-down'}
                size={14}
                color="#9CA3AF"
              />
            </Pressable>
            {!sectionsCollapsed.tracks &&
              tracks.map((t) => (
                <TopicItem
                  key={t.id}
                  topic={t}
                  isSelected={selectedId === t.id && (selectedType === 'topic' || selectedType === 'track')}
                  onPress={() => onSelectTopic(t.id, 'topic')}
                />
              ))}
          </VStack>
        )}

        {/* Quests */}
        {quests.length > 0 && (
          <VStack>
            <Pressable
              onPress={() => toggleSection('quests')}
              className="flex-row items-center justify-between px-3 py-1 mt-2"
            >
              <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase">
                Quests
              </UIText>
              <Ionicons
                name={sectionsCollapsed.quests ? 'chevron-forward' : 'chevron-down'}
                size={14}
                color="#9CA3AF"
              />
            </Pressable>
            {!sectionsCollapsed.quests &&
              quests.map((t) => (
                <TopicItem
                  key={t.id}
                  topic={t}
                  isSelected={selectedId === t.id && selectedType === 'quest'}
                  onPress={() => onSelectTopic(t.id, 'quest')}
                />
              ))}
          </VStack>
        )}

        {/* Courses */}
        {courses.length > 0 && (
          <VStack>
            <Pressable
              onPress={() => toggleSection('courses')}
              className="flex-row items-center justify-between px-3 py-1 mt-2"
            >
              <UIText size="xs" className="text-typo-400 font-poppins-medium uppercase">
                Courses
              </UIText>
              <Ionicons
                name={sectionsCollapsed.courses ? 'chevron-forward' : 'chevron-down'}
                size={14}
                color="#9CA3AF"
              />
            </Pressable>
            {!sectionsCollapsed.courses &&
              courses.map((c) => (
                <VStack key={c.id}>
                  <UIText size="xs" className="text-typo-500 font-poppins-medium px-3 py-1">
                    {c.name}
                  </UIText>
                  {c.children?.map((child) => (
                    <TopicItem
                      key={child.id}
                      topic={child}
                      isSelected={selectedId === child.id && selectedType === 'quest'}
                      onPress={() => onSelectTopic(child.id, 'quest')}
                    />
                  ))}
                </VStack>
              ))}
          </VStack>
        )}
      </VStack>
    </ScrollView>
  );
}
