/**
 * FeedCard - Unified feed item card.
 *
 * Renders both task completions and learning moments in a consistent layout.
 * Shows student info, content, evidence, pillar tags, and social actions.
 */

import React, { useState } from 'react';
import { View, Image, Pressable, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack, VStack, UIText, Card, Avatar, AvatarFallbackText, AvatarImage } from '../ui';
import { VideoPlayer } from './VideoPlayer';
import { DocumentViewer } from './DocumentViewer';
import { MediaModal } from './MediaModal';
import type { FeedItem } from '@/src/hooks/useFeed';
import { toggleLike } from '@/src/hooks/useFeed';
import { PillarBadge } from '../ui';

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;

  return (
    <Pressable onPress={() => isLong && setExpanded(!expanded)}>
      <View className="bg-surface-50 p-3 rounded-lg">
        <UIText
          size="sm"
          className="text-typo-500 italic"
          numberOfLines={expanded ? undefined : 4}
        >
          {text}
        </UIText>
        {isLong && (
          <UIText size="xs" className="text-optio-purple font-poppins-medium mt-1">
            {expanded ? 'Show less' : 'Read more'}
          </UIText>
        )}
      </View>
    </Pressable>
  );
}

function EvidenceDisplay({ evidence, media, description }: { evidence: FeedItem['evidence']; media?: FeedItem['media']; description?: string | null }) {
  const [modal, setModal] = useState<{ type: 'image' | 'video' | 'document'; uri: string; title?: string } | null>(null);

  // Collect all media items (images + videos)
  const allMedia = media || [];
  const imageUrl = allMedia.find((m) => m.type === 'image')?.url ||
    allMedia.find((m) => m.type === 'image')?.preview ||
    (evidence?.type === 'image' ? evidence?.url : null) ||
    evidence?.blocks?.find((b) => b.type === 'image')?.url;

  const videoUrl = allMedia.find((m) => m.type === 'video')?.url ||
    (evidence?.type === 'video' ? evidence?.url : null) ||
    evidence?.blocks?.find((b) => b.type === 'video')?.url;

  const textContent = evidence?.preview_text ||
    evidence?.blocks?.find((b) => b.type === 'text')?.content;

  const documentBlocks = evidence?.blocks?.filter((b) => b.type === 'document') || [];
  const linkBlocks = evidence?.blocks?.filter((b) => b.type === 'link') || [];

  // Check top-level evidence type for link/document
  const isLink = evidence?.type === 'link' && evidence?.url;
  const isDocument = evidence?.type === 'document' && evidence?.url;

  return (
    <VStack space="sm">
      {/* Image - tappable for full screen, fills card width */}
      {imageUrl && (
        <Pressable onPress={() => setModal({ type: 'image', uri: imageUrl })}>
          <Image
            source={{ uri: imageUrl }}
            className="w-full rounded-lg"
            style={{ aspectRatio: 3 / 4, minHeight: 300 }}
            resizeMode="cover"
          />
        </Pressable>
      )}

      {/* Video - plays inline, tap for full screen */}
      {videoUrl && !imageUrl && (
        <VideoPlayer uri={videoUrl} />
      )}

      {/* Text evidence - expandable (skip if same as description, shown above) */}
      {textContent && !imageUrl && !videoUrl && textContent !== description && (
        <ExpandableText text={textContent} />
      )}

      {/* Links (top-level or from blocks) */}
      {isLink && (
        <View className="bg-surface-50 p-3 rounded-lg border border-surface-200">
          <HStack className="items-center gap-2">
            <Ionicons name="link-outline" size={16} color="#6D469B" />
            <UIText size="sm" className="text-optio-purple flex-1" numberOfLines={1}>
              {evidence.title || evidence.url}
            </UIText>
          </HStack>
        </View>
      )}
      {linkBlocks.map((block, i) => (
        <View key={`link-${i}`} className="bg-surface-50 p-3 rounded-lg border border-surface-200">
          <HStack className="items-center gap-2">
            <Ionicons name="link-outline" size={16} color="#6D469B" />
            <UIText size="sm" className="text-optio-purple flex-1" numberOfLines={1}>
              {block.title || block.url || 'Link'}
            </UIText>
          </HStack>
        </View>
      ))}

      {/* Documents - tappable for full screen */}
      {isDocument && (
        <Pressable onPress={() => setModal({ type: 'document', uri: evidence.url!, title: evidence.title || undefined })}>
          <DocumentViewer uri={evidence.url!} title={evidence.title || undefined} />
        </Pressable>
      )}
      {documentBlocks.map((block, i) => (
        <Pressable key={`doc-${i}`} onPress={() => setModal({ type: 'document', uri: block.url!, title: block.title || undefined })}>
          <DocumentViewer uri={block.url!} title={block.title || undefined} />
        </Pressable>
      ))}

      {/* Full-screen modal */}
      {modal && (
        <MediaModal
          visible={!!modal}
          onClose={() => setModal(null)}
          type={modal.type}
          uri={modal.uri}
          title={modal.title}
        />
      )}
    </VStack>
  );
}

interface FeedCardProps {
  item: FeedItem;
  showStudent?: boolean;
  onPress?: () => void;
}

export function FeedCard({ item, showStudent = true, onPress }: FeedCardProps) {
  const [liked, setLiked] = useState(item.user_has_liked);
  const [likesCount, setLikesCount] = useState(item.likes_count);

  const isTask = item.type === 'task_completed';
  const title = isTask ? item.task?.title : item.moment?.title;
  const description = isTask ? null : item.moment?.description;
  const pillars = isTask ? [item.task?.pillar].filter(Boolean) : (item.moment?.pillars || []);
  const questTitle = isTask ? item.task?.quest_title : item.moment?.topic_name;

  const studentInitials = item.student?.display_name
    ?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const timeAgo = formatTimeAgo(item.timestamp);

  const handleLike = async () => {
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(!liked);
    setLikesCount(liked ? likesCount - 1 : likesCount + 1);
    try {
      await toggleLike(item.type, item.id);
    } catch {
      setLiked(prevLiked);
      setLikesCount(prevCount);
    }
  };

  return (
    <Pressable onPress={onPress}>
      <Card variant="elevated" size="md">
        <VStack space="sm">
          {/* Header: student + timestamp */}
          {showStudent && (
            <HStack className="items-center gap-3">
              <Avatar size="sm">
                {item.student?.avatar_url ? (
                  <AvatarImage source={{ uri: item.student.avatar_url }} />
                ) : (
                  <AvatarFallbackText>{studentInitials}</AvatarFallbackText>
                )}
              </Avatar>
              <VStack className="flex-1">
                <UIText size="sm" className="font-poppins-medium">
                  {item.student?.display_name || 'Student'}
                </UIText>
                <HStack className="items-center gap-2">
                  {isTask && (
                    <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                  )}
                  <UIText size="xs" className="text-typo-400">
                    {isTask ? 'Completed a task' : 'Learning moment'} · {timeAgo}
                  </UIText>
                </HStack>
              </VStack>
            </HStack>
          )}

          {/* Title - only for task completions or learning moments with a real title */}
          {isTask && (
            <UIText size="sm" className="font-poppins-semibold">
              {title || 'Untitled'}
            </UIText>
          )}
          {!isTask && title && title.toLowerCase() !== 'learning moment' && title !== description && (
            <UIText size="sm" className="font-poppins-semibold">
              {title}
            </UIText>
          )}

          {/* Quest/topic context */}
          {questTitle && (
            <HStack className="items-center gap-1.5">
              <Ionicons name={isTask ? 'rocket-outline' : 'folder-outline'} size={14} color="#9CA3AF" />
              <UIText size="xs" className="text-typo-400">{questTitle}</UIText>
            </HStack>
          )}

          {/* Description - expandable, skip default/generic learning moment descriptions */}
          {description && description !== title &&
            !description.toLowerCase().startsWith('learning moment') && (
            <ExpandableText text={description} />
          )}

          {/* Evidence */}
          {item.evidence && (
            <EvidenceDisplay evidence={item.evidence} media={item.media} description={description} />
          )}

          {/* Pillar tags */}
          {pillars.length > 0 && (
            <HStack className="items-center gap-2 flex-wrap">
              {pillars.map((p: string) => (
                <PillarBadge key={p} pillar={p} />
              ))}
              {isTask && item.task?.xp_value && (
                <HStack className="items-center gap-1 ml-auto">
                  <Ionicons name="star" size={12} color="#FF9028" />
                  <UIText size="xs" className="text-pillar-civics font-poppins-medium">
                    +{item.task.xp_value} XP
                  </UIText>
                </HStack>
              )}
            </HStack>
          )}

          {/* Social actions */}
          <HStack className="items-center gap-4 pt-1 border-t border-surface-100 mt-1">
            <Pressable onPress={handleLike} className="flex-row items-center gap-1.5 py-1">
              <Ionicons
                name={liked ? 'heart' : 'heart-outline'}
                size={18}
                color={liked ? '#EF597B' : '#9CA3AF'}
              />
              {likesCount > 0 && (
                <UIText size="xs" className={liked ? 'text-optio-pink' : 'text-typo-400'}>
                  {likesCount}
                </UIText>
              )}
            </Pressable>

            <Pressable className="flex-row items-center gap-1.5 py-1">
              <Ionicons name="chatbubble-outline" size={16} color="#9CA3AF" />
              {item.comments_count > 0 && (
                <UIText size="xs" className="text-typo-400">{item.comments_count}</UIText>
              )}
            </Pressable>

            <Pressable className="flex-row items-center gap-1.5 py-1">
              <Ionicons name="share-outline" size={16} color="#9CA3AF" />
            </Pressable>
          </HStack>
        </VStack>
      </Card>
    </Pressable>
  );
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date();
  const then = new Date(timestamp);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return then.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
