/**
 * LearningEventCard - Displays a single learning moment.
 * Shows title, description, pillars, evidence thumbnails, and topic tags.
 */

import React from 'react';
import { View, Image, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack, VStack, UIText, Card, Badge, BadgeText } from '../ui';
import type { LearningEvent } from '@/src/hooks/useJournal';

const pillarColors: Record<string, { bg: string; text: string }> = {
  stem: { bg: 'bg-pillar-stem/15', text: 'text-pillar-stem' },
  art: { bg: 'bg-pillar-art/15', text: 'text-pillar-art' },
  communication: { bg: 'bg-pillar-communication/15', text: 'text-pillar-communication' },
  civics: { bg: 'bg-pillar-civics/15', text: 'text-pillar-civics' },
  wellness: { bg: 'bg-pillar-wellness/15', text: 'text-pillar-wellness' },
};

const evidenceIcons: Record<string, keyof typeof Ionicons.glyphMap> = {
  text: 'document-text-outline',
  image: 'image-outline',
  video: 'videocam-outline',
  link: 'link-outline',
  document: 'attach-outline',
};

interface LearningEventCardProps {
  event: LearningEvent;
  onPress?: () => void;
}

export function LearningEventCard({ event, onPress }: LearningEventCardProps) {
  const imageBlock = event.evidence_blocks?.find((b) => b.block_type === 'image' && b.file_url);
  const otherEvidence = event.evidence_blocks?.filter((b) => b !== imageBlock) || [];
  const dateStr = new Date(event.event_date || event.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

  return (
    <Pressable onPress={onPress}>
      <Card variant="elevated" size="sm" className="overflow-hidden">
        {/* Image header */}
        {imageBlock?.file_url && (
          <View className="-mx-3 -mt-3 mb-3">
            <Image
              source={{ uri: imageBlock.file_url }}
              className="w-full h-40 rounded-t-xl"
              resizeMode="cover"
            />
          </View>
        )}

        <VStack space="xs">
          {/* Title + date */}
          <HStack className="items-start justify-between">
            <UIText size="sm" className="font-poppins-semibold flex-1">
              {event.title || event.description || 'Learning Moment'}
            </UIText>
            <UIText size="xs" className="text-typo-400 ml-2 flex-shrink-0">{dateStr}</UIText>
          </HStack>

          {/* Description (only if different from title) */}
          {event.description && event.title && event.description !== event.title && (
            <UIText size="xs" className="text-typo-500" numberOfLines={2}>
              {event.description}
            </UIText>
          )}

          {/* Pillars + evidence indicators */}
          <HStack className="items-center gap-2 flex-wrap">
            {event.pillars?.map((p) => {
              const colors = pillarColors[p] || pillarColors.stem;
              return (
                <View key={p} className={`px-2 py-0.5 rounded-full ${colors.bg}`}>
                  <UIText size="xs" className={`font-poppins-medium ${colors.text}`}>
                    {p === 'stem' ? 'STEM' : p.charAt(0).toUpperCase() + p.slice(1)}
                  </UIText>
                </View>
              );
            })}

            {otherEvidence.length > 0 && (
              <HStack className="items-center gap-1 ml-auto">
                {otherEvidence.slice(0, 3).map((b, i) => (
                  <Ionicons
                    key={i}
                    name={evidenceIcons[b.block_type] || 'ellipse-outline'}
                    size={14}
                    color="#9CA3AF"
                  />
                ))}
              </HStack>
            )}
          </HStack>

          {/* Topic tags */}
          {event.topics && event.topics.length > 0 && (
            <HStack className="items-center gap-1 flex-wrap">
              {event.topics.map((t) => (
                <View
                  key={`${t.type}-${t.id}`}
                  className="px-1.5 py-0.5 rounded bg-surface-100"
                >
                  <UIText size="xs" className="text-typo-400">
                    {t.name}
                  </UIText>
                </View>
              ))}
            </HStack>
          )}
        </VStack>
      </Card>
    </Pressable>
  );
}
