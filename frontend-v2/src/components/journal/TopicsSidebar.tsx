/**
 * TopicsSidebar - Journal organization grid (the student's own Topics).
 * Quest and Course entries are surfaced elsewhere (Discover sheet, Courses tab)
 * — this surface is intentionally just the personal buckets + Unassigned.
 * Desktop: always visible. Mobile: shown as a list view.
 */

import React, { useState } from 'react';
import { View, Pressable, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VStack, HStack, UIText, Skeleton } from '../ui';
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
  /** Optional: when provided, a small + button appears in the Topics header. */
  onNewTopic?: () => void;
  /** When true and topics is empty, render skeleton tiles so the grid has
   *  visible shape immediately while the API call is in flight. */
  loading?: boolean;
  /** When false, render as a plain View instead of its own ScrollView — for
   *  embedding inside a parent scroll (e.g. the Journal's topics + feed feed). */
  scrollable?: boolean;
}

/** Special tile for unassigned moments. Same shape as TopicCard so it sits
 *  cleanly in the same grid; always renders so the bucket is reachable even
 *  when empty. Copy + colorway shifts between the two states:
 *    count > 0 → amber "Assign N moments to topics" (action)
 *    count = 0 → green "All moments organized" (affirmation) */
function UnassignedTile({
  count,
  isSelected,
  onPress,
}: {
  count: number;
  isSelected: boolean;
  onPress: () => void;
}) {
  const hasWork = count > 0;
  const tint = hasWork ? '#B45309' : '#15803D'; // amber-700 vs green-700
  const bg = hasWork ? '#FFFBEB' : '#F0FDF4'; // amber-50 vs green-50
  const border = hasWork ? '#FDE68A' : '#BBF7D0'; // amber-200 vs green-200
  const iconBg = hasWork ? '#FEF3C7' : '#DCFCE7'; // amber-100 vs green-100
  const iconName: keyof typeof iconMap | 'albums-outline' | 'checkmark-circle-outline' =
    hasWork ? 'albums-outline' : 'checkmark-circle-outline';

  return (
    <View style={{ width: '48%' }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <View
          style={{
            backgroundColor: bg,
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 14,
            borderWidth: isSelected ? 2 : 1,
            borderColor: isSelected ? tint : border,
            minHeight: 108,
          }}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: iconBg,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 8,
            }}
          >
            <Ionicons name={iconName as any} size={20} color={tint} />
          </View>
          <UIText
            size="sm"
            className="font-poppins-semibold"
            style={{ color: tint }}
            numberOfLines={2}
          >
            {hasWork
              ? `Assign ${count} moment${count !== 1 ? 's' : ''} to topics`
              : 'All moments organized'}
          </UIText>
        </View>
      </Pressable>
    </View>
  );
}

/** Larger card tile — used for the user's own Topics. Two per row.
 *  Note: width MUST live on an outer wrapper View. Setting `width: '48%'`
 *  inside Pressable's `style={({pressed}) => ({...})}` function form silently
 *  doesn't apply on this RN/Expo combo (same bug we hit on the FAB), which
 *  is why cards were rendering 3-up instead of 2-up. */
function TopicCard({
  topic,
  isSelected,
  onPress,
}: {
  topic: UnifiedTopic;
  isSelected: boolean;
  onPress: () => void;
}) {
  const iconName = iconMap[topic.icon || 'default'] || iconMap.default;
  const tint = topic.color || '#6D469B';
  return (
    <View style={{ width: '48%' }}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}
      >
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 16,
            paddingHorizontal: 14,
            paddingVertical: 14,
            borderWidth: isSelected ? 2 : 1,
            borderColor: isSelected ? tint : '#E2DCE8',
            minHeight: 108,
          }}
        >
          <View
            style={{
              width: 36, height: 36, borderRadius: 10,
              backgroundColor: tint + '20',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 8,
            }}
          >
            <Ionicons name={iconName} size={20} color={tint} />
          </View>
          <UIText
            size="sm"
            className={isSelected ? 'font-poppins-semibold' : 'font-poppins-medium'}
            style={{ color: isSelected ? tint : '#0F0F1A' }}
            numberOfLines={2}
          >
            {topic.name}
          </UIText>
          {topic.moment_count != null && (
            <UIText size="xs" className="text-typo-400 mt-0.5">
              {topic.moment_count} moment{topic.moment_count !== 1 ? 's' : ''}
            </UIText>
          )}
        </View>
      </Pressable>
    </View>
  );
}

export function TopicsSidebar({
  topics,
  selectedId,
  selectedType,
  onSelectUnassigned,
  onSelectTopic,
  unassignedCount,
  onNewTopic,
  loading = false,
  scrollable = true,
}: TopicsSidebarProps) {
  const [sectionsCollapsed, setSectionsCollapsed] = useState<Record<string, boolean>>({});

  const tracks = topics.filter((t) => t.type === 'topic' || t.type === 'track');

  const toggleSection = (key: string) => {
    setSectionsCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const Wrapper: any = scrollable ? ScrollView : View;
  const wrapperProps = scrollable
    ? { className: 'flex-1', showsVerticalScrollIndicator: false }
    : {};

  return (
    <Wrapper {...wrapperProps}>
      <VStack space="xs" className="py-2">
        {/* Interest Tracks (rendered as 2-column larger cards — these are the
            student's own organization buckets, so they deserve more emphasis
            than the dense list rows used for Quests/Courses). The header is
            always visible (so the + can always be reached even when empty).
            The Unassigned bucket lives as the first tile in this grid when
            the student has any unsorted moments — it reads as the next action
            ("Assign 4 moments to topics") rather than a separate inbox. */}
        {/* Always render so the Unassigned tile stays reachable even with no
            tracks and no + button (e.g. the parent's read-mostly view). */}
        {(
          <VStack>
            <HStack className="items-center justify-between px-3 py-1">
              <Pressable
                onPress={() => toggleSection('tracks')}
                className="flex-row items-center gap-1"
                hitSlop={8}
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
              {onNewTopic && (
                <Pressable
                  onPress={onNewTopic}
                  hitSlop={8}
                  accessibilityLabel="New topic"
                  className="w-7 h-7 rounded-full bg-optio-purple/10 items-center justify-center active:bg-optio-purple/20"
                >
                  <Ionicons name="add" size={16} color="#6D469B" />
                </Pressable>
              )}
            </HStack>
            {!sectionsCollapsed.tracks && (
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  rowGap: 10,
                  paddingHorizontal: 8,
                  paddingTop: 6,
                  paddingBottom: 4,
                  justifyContent: 'space-between',
                }}
              >
                {loading && tracks.length === 0 ? (
                  // Skeleton tiles — same footprint as TopicCard so the grid's
                  // height + spacing don't jump when real data lands.
                  [0, 1, 2, 3].map((i) => (
                    <View key={`sk-${i}`} style={{ width: '48%' }}>
                      <Skeleton style={{ height: 108, borderRadius: 16 }} />
                    </View>
                  ))
                ) : (
                  <>
                    {tracks.map((t) => (
                      <TopicCard
                        key={t.id}
                        topic={t}
                        isSelected={selectedId === t.id && (selectedType === 'topic' || selectedType === 'track')}
                        onPress={() => onSelectTopic(t.id, 'topic')}
                      />
                    ))}
                    {/* Unassigned tile sits at the END — it's a catch-all that
                        shouldn't visually outrank the student's own topics. */}
                    <UnassignedTile
                      count={unassignedCount}
                      isSelected={selectedType === 'unassigned'}
                      onPress={onSelectUnassigned}
                    />
                  </>
                )}
              </View>
            )}
          </VStack>
        )}

        {/* Quests + Courses sections removed from the Journal — quests are now
            discovered via the slide-up "Discover quests" sheet, and courses
            live on their own surface. Keeping them out of the Journal makes
            the page about the student's own organization (Topics). */}
      </VStack>
    </Wrapper>
  );
}
