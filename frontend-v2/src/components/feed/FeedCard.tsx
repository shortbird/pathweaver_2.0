/**
 * FeedCard - Unified feed item card.
 *
 * Renders both task completions and learning moments in a consistent layout.
 * Shows student info, content, evidence, pillar tags, and social actions.
 */

import React, { useState, useRef } from 'react';
import { View, Image, Pressable, Linking, Animated, Platform, Share } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HStack, VStack, UIText, Card, Avatar, AvatarFallbackText, AvatarImage } from '../ui';
import { VideoPlayer } from './VideoPlayer';
import { DocumentViewer } from './DocumentViewer';
import { MediaModal } from './MediaModal';
import type { FeedItem } from '@/src/hooks/useFeed';
import { toggleLike, createShareLink, toggleVisibility } from '@/src/hooks/useFeed';
import { useAuthStore } from '@/src/stores/authStore';
import { PillarBadge } from '../ui';
import { displayImageUrl, isHeicUrl } from '@/src/services/imageUrl';
import { CommentSheet } from './CommentSheet';

/** Request a server-resized thumbnail for Supabase storage URLs to save memory */
function thumbUrl(url: string, width = 600): string {
  if (!url) return url;
  // Supabase storage URLs support /render/image/public with transform params
  if (url.includes('.supabase.co/storage/v1/object/public/')) {
    return url.replace(
      '/storage/v1/object/public/',
      `/storage/v1/render/image/public/`
    ) + `?width=${width}&resize=contain`;
  }
  return url;
}

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

  // HEIC files may arrive as 'link' or 'document' type -- rescue them as images
  const topLevelIsHeic = isHeicUrl(evidence?.url);

  const imageUrl = displayImageUrl(
    allMedia.find((m) => m.type === 'image')?.url ||
    allMedia.find((m) => m.type === 'image')?.preview ||
    (evidence?.type === 'image' ? evidence?.url : null) ||
    evidence?.blocks?.find((b) => b.type === 'image')?.url ||
    (topLevelIsHeic ? evidence?.url : null) ||
    evidence?.blocks?.find((b) => (b.type === 'document' || b.type === 'link') && isHeicUrl(b.url))?.url ||
    null
  );

  const videoUrl = allMedia.find((m) => m.type === 'video')?.url ||
    (evidence?.type === 'video' ? evidence?.url : null) ||
    evidence?.blocks?.find((b) => b.type === 'video')?.url;

  const textContent = evidence?.preview_text ||
    evidence?.blocks?.find((b) => b.type === 'text')?.content;

  // Filter HEIC files out of document/link blocks -- rendered as images above
  const documentBlocks = evidence?.blocks?.filter((b) => b.type === 'document' && !isHeicUrl(b.url)) || [];
  const linkBlocks = evidence?.blocks?.filter((b) => b.type === 'link' && !isHeicUrl(b.url)) || [];

  // Top-level link/document: skip if HEIC (handled as image above)
  const isLink = evidence?.type === 'link' && evidence?.url && !topLevelIsHeic;
  const isDocument = evidence?.type === 'document' && evidence?.url && !topLevelIsHeic;

  return (
    <VStack space="sm">
      {/* Image - tappable for full screen, fills card width */}
      {imageUrl && (
        <Pressable onPress={() => setModal({ type: 'image', uri: imageUrl })}>
          <Image
            source={{ uri: thumbUrl(imageUrl) }}
            className="w-full rounded-lg"
            style={{ height: 280 }}
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
        <Pressable onPress={() => Platform.OS === 'web' ? window.open(evidence.url!, '_blank') : Linking.openURL(evidence.url!)}>
          <View className="bg-surface-50 p-3 rounded-lg border border-surface-200">
            <HStack className="items-center gap-2">
              <Ionicons name="link-outline" size={16} color="#6D469B" />
              <UIText size="sm" className="text-optio-purple flex-1" numberOfLines={1}>
                {evidence.title || evidence.url}
              </UIText>
            </HStack>
          </View>
        </Pressable>
      )}
      {linkBlocks.map((block, i) => (
        <Pressable key={`link-${i}`} onPress={() => Platform.OS === 'web' ? window.open(block.url!, '_blank') : Linking.openURL(block.url!)}>
          <View className="bg-surface-50 p-3 rounded-lg border border-surface-200">
            <HStack className="items-center gap-2">
              <Ionicons name="link-outline" size={16} color="#6D469B" />
              <UIText size="sm" className="text-optio-purple flex-1" numberOfLines={1}>
                {block.title || block.url || 'Link'}
              </UIText>
            </HStack>
          </View>
        </Pressable>
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
  const [commentsCount, setCommentsCount] = useState(item.comments_count);
  const [isConfidential, setIsConfidential] = useState(item.is_confidential);
  const [showComments, setShowComments] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareToast, setShareToast] = useState('');
  const likeScale = useRef(new Animated.Value(1)).current;
  const { user } = useAuthStore();

  const isTask = item.type === 'task_completed';
  const isOwnPost = user?.id === item.student?.id;
  const title = isTask ? item.task?.title : item.moment?.title;
  const description = isTask ? null : item.moment?.description;
  const pillars = isTask ? [item.task?.pillar].filter(Boolean) : (item.moment?.pillars || []);
  const questTitle = isTask ? item.task?.quest_title : item.moment?.topic_name;

  const studentInitials = item.student?.display_name
    ?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  const timeAgo = formatTimeAgo(item.timestamp);

  const animateLike = () => {
    Animated.sequence([
      Animated.spring(likeScale, { toValue: 1.4, useNativeDriver: true, speed: 50, bounciness: 12 }),
      Animated.spring(likeScale, { toValue: 1, useNativeDriver: true, speed: 50, bounciness: 12 }),
    ]).start();
  };

  const handleLike = async () => {
    const prevLiked = liked;
    const prevCount = likesCount;
    setLiked(!liked);
    setLikesCount(liked ? likesCount - 1 : likesCount + 1);
    if (!liked) animateLike();
    try {
      await toggleLike(item.type, item.id);
    } catch {
      setLiked(prevLiked);
      setLikesCount(prevCount);
    }
  };

  const showToast = (msg: string) => {
    setShareToast(msg);
    setTimeout(() => setShareToast(''), 2500);
  };

  const handleShare = async () => {
    if (isConfidential) {
      showToast('This post is private');
      return;
    }
    setSharing(true);
    try {
      const { share_url } = await createShareLink(item.type, item.id);
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(share_url);
        showToast('Link copied!');
      } else {
        await Share.share({ url: share_url, message: share_url });
      }
    } catch {
      showToast('Failed to share');
    } finally {
      setSharing(false);
    }
  };

  const handleToggleVisibility = async () => {
    const newHidden = !isConfidential;
    setIsConfidential(newHidden);
    try {
      await toggleVisibility(item.type, item.id, newHidden, item.completion_id);
    } catch {
      setIsConfidential(!newHidden);
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
              <Animated.View style={{ transform: [{ scale: likeScale }] }}>
                <Ionicons
                  name={liked ? 'heart' : 'heart-outline'}
                  size={18}
                  color={liked ? '#EF597B' : '#9CA3AF'}
                />
              </Animated.View>
              {likesCount > 0 && (
                <UIText size="xs" className={liked ? 'text-optio-pink' : 'text-typo-400'}>
                  {likesCount}
                </UIText>
              )}
            </Pressable>

            <Pressable onPress={() => setShowComments(true)} className="flex-row items-center gap-1.5 py-1">
              <Ionicons name="chatbubble-outline" size={16} color="#9CA3AF" />
              {commentsCount > 0 && (
                <UIText size="xs" className="text-typo-400">{commentsCount}</UIText>
              )}
            </Pressable>

            <Pressable onPress={handleShare} disabled={sharing} className="flex-row items-center gap-1.5 py-1" style={{ opacity: sharing ? 0.5 : 1 }}>
              <Ionicons name="share-outline" size={16} color={isConfidential ? '#D1D5DB' : '#9CA3AF'} />
            </Pressable>

            {/* Visibility toggle - only for student's own posts */}
            {isOwnPost && (
              <Pressable onPress={handleToggleVisibility} className="flex-row items-center gap-1.5 py-1 ml-auto">
                <Ionicons
                  name={isConfidential ? 'eye-off-outline' : 'eye-outline'}
                  size={16}
                  color={isConfidential ? '#EF597B' : '#9CA3AF'}
                />
                <UIText size="xs" className={isConfidential ? 'text-optio-pink' : 'text-typo-400'}>
                  {isConfidential ? 'Private' : 'Public'}
                </UIText>
              </Pressable>
            )}
          </HStack>

          {/* Share toast */}
          {shareToast ? (
            <View className="bg-typo-700 rounded-lg py-2 px-3 self-center mt-1">
              <UIText size="xs" className="text-white font-poppins-medium">{shareToast}</UIText>
            </View>
          ) : null}
        </VStack>
      </Card>

      {/* Comment sheet */}
      {showComments && (
        <CommentSheet
          visible={showComments}
          item={item}
          onClose={() => setShowComments(false)}
          onCommentPosted={() => setCommentsCount((c) => c + 1)}
        />
      )}
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
