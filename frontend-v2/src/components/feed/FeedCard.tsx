/**
 * FeedCard - Unified feed item card.
 *
 * Renders both task completions and learning moments in a consistent layout.
 * Shows student info, content, evidence, pillar tags, and social actions.
 */

import React, { memo, useState } from 'react';
import { View, Pressable, Platform, Share, ScrollView } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { HStack, VStack, UIText, Card, Avatar, AvatarFallbackText, AvatarImage } from '../ui';
import { VideoPlayer } from './VideoPlayer';
import { DocumentViewer } from './DocumentViewer';
import { MediaModal } from './MediaModal';
import { LinkPreviewCard } from './LinkPreviewCard';
import { AudioClipPreview } from '../capture/VoiceRecorder';
import type { FeedItem } from '@/src/hooks/useFeed';
import { getViewers, createShareLink, toggleVisibility, toggleFeedHighlight } from '@/src/hooks/useFeed';
import { haptic } from '@/src/utils/haptics';
import { useAuthStore } from '@/src/stores/authStore';
import { useMediaUploadStore } from '@/src/stores/mediaUploadStore';
import { PillarBadge } from '../ui';
import { displayImageUrl, isHeicUrl } from '@/src/services/imageUrl';
import { CommentSheet } from './CommentSheet';
import { FeedItemMenu } from './FeedItemMenu';
import { useThemeColors } from '@/src/hooks/useThemeColors';

/** Feed image that renders at its natural aspect ratio so the WHOLE image
 *  shows (bug: "Show the whole image in the feed post" — the old fixed-height
 *  cover crop hid the top/bottom). Ratio is clamped so an extreme panorama or
 *  very tall scan can't dominate the feed. */
function FeedImage({ uri, onPress }: { uri: string; onPress: () => void }) {
  const [ratio, setRatio] = useState(4 / 3);
  // Use the SAME URL the full-screen preview uses: displayImageUrl returns the
  // original object URL for web-safe images and only routes HEIC/HEIF through
  // the Supabase render/transcode endpoint. The previous approach forced EVERY
  // image through /render/image with a resize, which was flaky and returned
  // blank-but-200 for some (so onError never fired) while the modal — using
  // displayImageUrl — showed them fine. expo-image downscales to the display
  // size on native, so dropping the server resize doesn't blow up memory.
  // onError falls back to the raw URL as a last resort.
  const [failed, setFailed] = useState(false);
  const source = failed ? uri : (displayImageUrl(uri) || uri);
  return (
    <Pressable onPress={onPress}>
      <ExpoImage
        source={{ uri: source }}
        recyclingKey={uri}
        className="w-full rounded-lg bg-surface-100 dark:bg-dark-surface-200"
        style={{ width: '100%', aspectRatio: ratio }}
        contentFit="cover"
        cachePolicy="memory-disk"
        transition={150}
        onError={() => setFailed((prev) => prev || true)}
        onLoad={(e: any) => {
          const w = e?.source?.width;
          const h = e?.source?.height;
          if (w && h) setRatio(Math.max(0.5, Math.min(2.5, w / h)));
        }}
      />
    </Pressable>
  );
}

/** Swipeable image carousel (Instagram-style) for moments with multiple photos.
 *  Replaces the old 2-up collage grid. Each page shows the whole image at its
 *  natural ratio; tap opens the full-screen viewer. Page dots track position. */
function ImageCarousel({ uris, onPress }: { uris: string[]; onPress: (uri: string) => void }) {
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <ScrollView
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        >
          {uris.map((uri, i) => (
            <View key={`carousel-${i}`} style={{ width }}>
              <FeedImage uri={uri} onPress={() => onPress(uri)} />
            </View>
          ))}
        </ScrollView>
      )}
      {/* Page dots */}
      <HStack className="items-center justify-center gap-1.5 mt-2">
        {uris.map((_, i) => (
          <View
            key={`dot-${i}`}
            style={{ width: 6, height: 6, borderRadius: 3 }}
            className={i === index ? 'bg-optio-purple' : 'bg-surface-300 dark:bg-dark-surface-300'}
          />
        ))}
      </HStack>
    </View>
  );
}

function ExpandableText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > 200;

  return (
    <Pressable onPress={() => isLong && setExpanded(!expanded)}>
      <View className="bg-surface-50 dark:bg-dark-surface-50 p-3 rounded-lg">
        <UIText
          size="sm"
          className="text-typo-500 dark:text-dark-typo-500 italic"
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

function EvidenceDisplay({ evidence, media, description, isActive = true, uploadingPct }: { evidence: FeedItem['evidence']; media?: FeedItem['media']; description?: string | null; isActive?: boolean; uploadingPct?: number }) {
  const [modal, setModal] = useState<{ type: 'image' | 'video' | 'document'; uri: string; title?: string } | null>(null);

  // Collect all media items (images + videos)
  const allMedia = media || [];

  // HEIC files may arrive as 'link' or 'document' type -- rescue them as images
  const topLevelIsHeic = isHeicUrl(evidence?.url);

  // Collect ALL images, not just the first — a moment with multiple photos was
  // only ever showing image #1 because this used .find(). Order: media images,
  // top-level image evidence, image blocks, then HEIC files rescued from the
  // top level / document / link blocks. Dedupe after normalizing each URL.
  const rawImageUrls: (string | null | undefined)[] = [
    ...allMedia.filter((m) => m.type === 'image').map((m) => m.url || m.preview),
    evidence?.type === 'image' ? evidence?.url : null,
    ...(evidence?.blocks?.filter((b) => b.type === 'image').map((b) => b.url) || []),
    topLevelIsHeic ? evidence?.url : null,
    ...(evidence?.blocks
      ?.filter((b) => (b.type === 'document' || b.type === 'link') && isHeicUrl(b.url))
      .map((b) => b.url) || []),
  ];
  const imageUrls = Array.from(
    new Set(
      rawImageUrls
        .filter((u): u is string => !!u)
        .map((u) => displayImageUrl(u))
        .filter((u): u is string => !!u)
    )
  );
  const hasImage = imageUrls.length > 0;

  const videoUrl = allMedia.find((m) => m.type === 'video')?.url ||
    (evidence?.type === 'video' ? evidence?.url : null) ||
    evidence?.blocks?.find((b) => b.type === 'video')?.url;

  const textContent = evidence?.preview_text ||
    evidence?.blocks?.find((b) => b.type === 'text')?.content;

  // Filter HEIC files out of document/link blocks -- rendered as images above
  const documentBlocks = evidence?.blocks?.filter((b) => b.type === 'document' && !isHeicUrl(b.url)) || [];
  const linkBlocks = evidence?.blocks?.filter((b) => b.type === 'link' && !isHeicUrl(b.url)) || [];

  // Voice notes — learning moments carry audio in `media`; tasks may carry it
  // as a block. Always playable, independent of any image/video above.
  const audioItems = [
    ...allMedia.filter((m) => m.type === 'audio'),
    ...(evidence?.blocks?.filter((b) => b.type === 'audio') || []).map((b: any) => ({
      url: b.url, title: b.title, duration_ms: b.content?.duration_ms,
    })),
  ].filter((a) => a.url);

  // Top-level link/document: skip if HEIC (handled as image above)
  const isLink = evidence?.type === 'link' && evidence?.url && !topLevelIsHeic;
  const isDocument = evidence?.type === 'document' && evidence?.url && !topLevelIsHeic;

  return (
    <VStack space="sm">
      {/* Single image - whole image at natural ratio, tap for full screen */}
      {imageUrls.length === 1 && (
        <FeedImage uri={imageUrls[0]} onPress={() => setModal({ type: 'image', uri: imageUrls[0] })} />
      )}

      {/* Multiple images - swipeable carousel, each tappable for full screen */}
      {imageUrls.length > 1 && (
        <ImageCarousel uris={imageUrls} onPress={(uri) => setModal({ type: 'image', uri })} />
      )}

      {/* Video - plays inline; expand button opens the full-screen player */}
      {videoUrl && !hasImage && (
        <View>
          {/* Pause the inline player while the full-screen player is open so
              you don't hear the audio twice (bug #29). */}
          <VideoPlayer uri={videoUrl} isActive={isActive && modal?.type !== 'video'} />
          <Pressable
            onPress={() => setModal({ type: 'video', uri: videoUrl })}
            className="absolute top-2 right-2 w-9 h-9 rounded-full bg-black/50 items-center justify-center"
            hitSlop={6}
            accessibilityLabel="Full screen video"
          >
            <Ionicons name="expand" size={18} color="#fff" />
          </Pressable>
        </View>
      )}

      {/* Background upload still in flight — show progress so the moment doesn't
          look like it failed before the video block lands. */}
      {!videoUrl && uploadingPct !== undefined && (
        <View className="w-full rounded-lg bg-surface-100 dark:bg-dark-surface-200 items-center justify-center" style={{ height: 160 }}>
          <Ionicons name="cloud-upload-outline" size={28} color="#6D469B" />
          <UIText size="sm" className="text-typo-500 dark:text-dark-typo-500 mt-2 font-poppins-medium">
            Uploading… {uploadingPct}%
          </UIText>
        </View>
      )}

      {/* Voice notes — inline audio player. Wrapped so play taps don't bubble
          to the card's onPress. */}
      {audioItems.map((a, i) => (
        <Pressable key={`audio-${i}`} onPress={(e) => e.stopPropagation?.()}>
          <AudioClipPreview
            clip={{ uri: a.url!, name: a.title || 'Voice note', fileSize: 0, durationMs: a.duration_ms || 0 }}
          />
        </Pressable>
      ))}

      {/* Text evidence - expandable (skip if same as description, shown above) */}
      {textContent && !hasImage && !videoUrl && textContent !== description && (
        <ExpandableText text={textContent} />
      )}

      {/* Links (top-level or from blocks) */}
      {isLink && (
        <LinkPreviewCard url={evidence.url!} title={evidence.title} />
      )}
      {linkBlocks.map((block, i) => (
        <LinkPreviewCard key={`link-${i}`} url={block.url!} title={block.title} />
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
  /** When true, surface the privacy toggle even if the viewer isn't the
   *  post owner. Used by parent surfaces (Family tab "Recent Activity" +
   *  Feed tab) so parents can mark a kid's items private from their feed
   *  without having to switch into the kid's account. The backend authorizes
   *  the call against the owner; this is just UI gating. */
  viewerCanModerate?: boolean;
  /** False when the card is scrolled out of view — pauses inline video so it
   *  doesn't keep playing off-screen. Defaults to true. */
  isActive?: boolean;
  /** Called after a superadmin toggles this item on/off the highlight reel,
   *  so the host screen can mutate its list (e.g. drop it from the Highlights
   *  feed when unhighlighted). */
  onHighlightChange?: (id: string, on: boolean) => void;
}

function FeedCardImpl({ item, showStudent = true, onPress, viewerCanModerate = false, isActive = true, onHighlightChange }: FeedCardProps) {
  const [viewsCount, setViewsCount] = useState(item.views_count || 0);
  // Background video upload progress for this moment (if any in flight).
  const uploadingPct = useMediaUploadStore((s) =>
    item.learning_event_id ? s.uploads[item.learning_event_id] : undefined);
  const [viewers, setViewers] = useState<Array<{ id: string; display_name: string; avatar_url: string | null; is_platform?: boolean }>>([]);
  const [showViewersList, setShowViewersList] = useState(false);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [commentsCount, setCommentsCount] = useState(item.comments_count);
  const [isConfidential, setIsConfidential] = useState(item.is_confidential);
  const [showComments, setShowComments] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareToast, setShareToast] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(!!item.is_highlighted);
  const [togglingHighlight, setTogglingHighlight] = useState(false);
  const { user } = useAuthStore();
  const c = useThemeColors();
  const canHighlight = user?.role === 'superadmin';

  const handleToggleHighlight = async () => {
    if (togglingHighlight) return;
    const next = !isHighlighted;
    setIsHighlighted(next);
    setTogglingHighlight(true);
    try {
      const id = item.type === 'learning_moment'
        ? (item.learning_event_id || item.id.replace(/^le_/, ''))
        : (item.completion_id || item.id);
      const res = await toggleFeedHighlight({ type: item.type, id, on: next });
      setIsHighlighted(res.is_highlighted);
      onHighlightChange?.(item.id, res.is_highlighted);
    } catch {
      setIsHighlighted(!next);
    } finally {
      setTogglingHighlight(false);
    }
  };

  const isTask = item.type === 'task_completed';
  const isOwnPost = user?.id === item.student?.id;
  const canTogglePrivacy = isOwnPost || viewerCanModerate;
  // Only surface the share button when the viewer is actually allowed to create
  // a share link (backend-determined). Undefined (older responses) is treated as
  // shareable so we don't hide the button on version skew.
  const canShare = item.can_share !== false;
  const title = isTask ? item.task?.title : item.moment?.title;
  const description = isTask ? null : item.moment?.description;
  const pillars = isTask ? [item.task?.pillar].filter(Boolean) : (item.moment?.pillars || []);
  const questTitle = isTask ? item.task?.quest_title : item.moment?.topic_name;

  const studentInitials = item.student?.display_name
    ?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';

  // Tap a student's avatar/name to open their profile. Route by the viewer's
  // effective role: own post -> the Profile tab; observers -> the observer
  // student overview; everyone else (parent/superadmin) -> the parent-style
  // child profile. Org users carry their real role in org_role.
  const effectiveRole = user?.org_role || user?.role;
  const goToProfile = () => {
    const sid = item.student?.id;
    if (!sid) return;
    if (isOwnPost) { router.push('/(app)/(tabs)/profile'); return; }
    if (effectiveRole === 'observer') { router.push(`/observers/student/${sid}`); return; }
    router.push(`/parent/child/${sid}`);
  };

  // Multi-kid grouped post: a parent captured one moment for several kids, so we
  // show every tagged kid (avatars + names) on a single card.
  const feedStudents = (item.students && item.students.length > 0)
    ? item.students
    : (item.student ? [item.student] : []);
  const isMultiStudent = feedStudents.length > 1;
  const studentsLabel = isMultiStudent
    ? feedStudents.map((s) => s.display_name || 'Student').join(', ')
    : (item.student?.display_name || 'Student');

  const timeAgo = formatTimeAgo(item.timestamp);

  const handleShowViewers = async () => {
    if (showViewersList) {
      setShowViewersList(false);
      return;
    }
    setShowViewersList(true);
    setLoadingViewers(true);
    try {
      const data = await getViewers(item.type, item.id);
      setViewers(data.viewers || []);
      setViewsCount(data.total || 0);
    } catch {
      // silently fail
    } finally {
      setLoadingViewers(false);
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
      const { share_url } = await createShareLink({
        type: item.type,
        completionId: item.completion_id,
        learningEventId: item.learning_event_id,
        id: item.id,
      });
      if (Platform.OS === 'web') {
        await navigator.clipboard.writeText(share_url);
        showToast('Link copied!');
      } else {
        // iOS shares `message` and `url` separately — passing the URL as both
        // makes it appear twice. iOS: `url` only; Android ignores `url`, so it
        // needs the link in `message`.
        await Share.share(Platform.OS === 'ios' ? { url: share_url } : { message: share_url });
      }
    } catch {
      showToast('Failed to share');
    } finally {
      setSharing(false);
    }
  };

  const handleToggleVisibility = async () => {
    haptic.light();
    const newHidden = !isConfidential;
    setIsConfidential(newHidden);
    try {
      await toggleVisibility({
        type: item.type,
        id: item.id,
        hidden: newHidden,
        blockId: item.block_id,
        completionId: item.completion_id,
        learningEventId: item.learning_event_id,
      });
    } catch {
      haptic.error();
      setIsConfidential(!newHidden);
    }
  };

  if (hidden) return null;

  const moderationTargetType: 'learning_event' | 'task_completion' =
    isTask ? 'task_completion' : 'learning_event';
  const moderationTargetId = isTask
    ? (item.completion_id || item.id)
    : (item.learning_event_id || item.id);

  return (
    <Pressable onPress={onPress}>
      <Card variant="elevated" size="md">
        <VStack space="sm">
          {/* Header: student + timestamp */}
          {showStudent && (
            <HStack className="items-center gap-3">
              {isMultiStudent ? (
                // Overlapping avatars for a moment shared across multiple kids.
                <HStack>
                  {feedStudents.slice(0, 3).map((s, i) => (
                    <View key={s.id} style={{ marginLeft: i === 0 ? 0 : -10 }}>
                      <Avatar size="sm">
                        {s.avatar_url ? (
                          <AvatarImage source={{ uri: s.avatar_url }} />
                        ) : (
                          <AvatarFallbackText>{(s.display_name || '?').charAt(0).toUpperCase()}</AvatarFallbackText>
                        )}
                      </Avatar>
                    </View>
                  ))}
                </HStack>
              ) : (
                <Pressable onPress={(e) => { e.stopPropagation?.(); goToProfile(); }} hitSlop={6} accessibilityRole="button" accessibilityLabel={`View ${studentsLabel}'s profile`}>
                  <Avatar size="sm">
                    {item.student?.avatar_url ? (
                      <AvatarImage source={{ uri: item.student.avatar_url }} />
                    ) : (
                      <AvatarFallbackText>{studentInitials}</AvatarFallbackText>
                    )}
                  </Avatar>
                </Pressable>
              )}
              <VStack className="flex-1">
                {isMultiStudent ? (
                  <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                    {studentsLabel}
                  </UIText>
                ) : (
                  <Pressable onPress={(e) => { e.stopPropagation?.(); goToProfile(); }}>
                    <UIText size="sm" className="font-poppins-medium" numberOfLines={1}>
                      {studentsLabel}
                    </UIText>
                  </Pressable>
                )}
                <HStack className="items-center gap-2">
                  {isTask && item.completion_id && (
                    <Ionicons name="checkmark-circle" size={12} color="#16A34A" />
                  )}
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">
                    {isTask
                      ? (item.completion_id ? 'Completed a task' : 'Added evidence')
                      : 'Learning moment'} · {timeAgo}
                  </UIText>
                </HStack>
                {/* Who shared it, when a parent posted for the child (bug #27). */}
                {!isTask && item.moment?.posted_by && (
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400" numberOfLines={1}>
                    Posted by {item.moment.posted_by.display_name}
                  </UIText>
                )}
              </VStack>
              {!isOwnPost && (
                <Pressable
                  onPress={(e) => {
                    e.stopPropagation?.();
                    setMenuOpen(true);
                  }}
                  hitSlop={10}
                  accessibilityLabel="More options"
                  className="p-1"
                >
                  <Ionicons name="ellipsis-horizontal" size={20} color={c.iconMuted} />
                </Pressable>
              )}
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
              <Ionicons name={isTask ? 'rocket-outline' : 'folder-outline'} size={14} color={c.iconMuted} />
              <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">{questTitle}</UIText>
            </HStack>
          )}

          {/* Description - expandable, skip default/generic learning moment descriptions */}
          {description && description !== title &&
            !description.toLowerCase().startsWith('learning moment') && (
            <ExpandableText text={description} />
          )}

          {/* Evidence */}
          {item.evidence && (
            <EvidenceDisplay evidence={item.evidence} media={item.media} description={description} isActive={isActive} uploadingPct={uploadingPct} />
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

          {/* Social actions — bigger icons + tap targets so comment/views/share
              are easy to hit (bug: "buttons need to be bigger"). */}
          <HStack className="items-center gap-5 pt-1 border-t border-surface-100 dark:border-dark-surface-300 mt-1">
            <Pressable onPress={handleShowViewers} hitSlop={12} accessibilityLabel="Viewers" className="flex-row items-center gap-1.5 py-2.5">
              <Ionicons
                name="eye-outline"
                size={26}
                color={showViewersList ? '#6D469B' : c.iconMuted}
              />
              {viewsCount > 0 && (
                <UIText size="sm" className={showViewersList ? 'text-optio-purple' : 'text-typo-400 dark:text-dark-typo-400'}>
                  {viewsCount}
                </UIText>
              )}
            </Pressable>

            <Pressable onPress={() => setShowComments(true)} hitSlop={12} accessibilityLabel="Comments" className="flex-row items-center gap-1.5 py-2.5">
              <Ionicons name="chatbubble-outline" size={26} color={c.iconMuted} />
              {commentsCount > 0 && (
                <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">{commentsCount}</UIText>
              )}
            </Pressable>

            {canShare && (
              <Pressable onPress={handleShare} disabled={sharing} hitSlop={12} accessibilityLabel="Share" className="flex-row items-center gap-1.5 py-2.5" style={{ opacity: sharing ? 0.5 : 1 }}>
                <Ionicons name="share-outline" size={26} color={isConfidential ? c.border : c.iconMuted} />
              </Pressable>
            )}

            {/* Superadmin: pin/unpin to the highlight reel */}
            {canHighlight && (
              <Pressable
                onPress={handleToggleHighlight}
                disabled={togglingHighlight}
                hitSlop={12}
                accessibilityLabel={isHighlighted ? 'Remove from highlights' : 'Add to highlights'}
                className="flex-row items-center gap-1.5 py-2.5 ml-auto"
                style={{ opacity: togglingHighlight ? 0.5 : 1 }}
              >
                <Ionicons
                  name={isHighlighted ? 'star' : 'star-outline'}
                  size={26}
                  color={isHighlighted ? '#FF9028' : c.iconMuted}
                />
              </Pressable>
            )}

            {/* Visibility toggle - owner always; parents on kid posts via prop */}
            {canTogglePrivacy && (
              <Pressable onPress={handleToggleVisibility} hitSlop={12} className={`flex-row items-center gap-1.5 py-2.5 ${canHighlight ? '' : 'ml-auto'}`}>
                <Ionicons
                  name={isConfidential ? 'eye-off-outline' : 'eye-outline'}
                  size={26}
                  color={isConfidential ? '#EF597B' : c.iconMuted}
                />
                <UIText size="xs" className={isConfidential ? 'text-optio-pink' : 'text-typo-400 dark:text-dark-typo-400'}>
                  {isConfidential ? 'Private' : 'Public'}
                </UIText>
              </Pressable>
            )}
          </HStack>

          {/* Viewers list */}
          {showViewersList && (
            <View className="bg-surface-50 dark:bg-dark-surface-50 rounded-lg p-3 mt-1">
              {loadingViewers ? (
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">Loading...</UIText>
              ) : viewers.length > 0 ? (
                <VStack space="xs">
                  <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 font-poppins-medium">Viewed by</UIText>
                  {viewers.map((v) => (
                    <HStack key={v.id} className="items-center gap-2">
                      <Avatar size="xs">
                        {v.is_platform ? (
                          <ExpoImage source={require('@/assets/images/icon.png')} style={{ width: '100%', height: '100%', backgroundColor: '#fff' }} contentFit="cover" />
                        ) : v.avatar_url ? (
                          <AvatarImage source={{ uri: v.avatar_url }} />
                        ) : (
                          <AvatarFallbackText>{v.display_name?.charAt(0) || '?'}</AvatarFallbackText>
                        )}
                      </Avatar>
                      <UIText size="xs" className="text-typo-600 dark:text-dark-typo-700">{v.display_name}</UIText>
                    </HStack>
                  ))}
                </VStack>
              ) : (
                <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 text-center">No views yet</UIText>
              )}
            </View>
          )}

          {/* Share toast */}
          {shareToast ? (
            <View className="bg-typo-700 dark:bg-dark-surface-300 rounded-lg py-2 px-3 self-center mt-1">
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

      {/* Moderation overflow menu */}
      {menuOpen && (
        <FeedItemMenu
          visible={menuOpen}
          onClose={() => setMenuOpen(false)}
          targetType={moderationTargetType}
          targetId={moderationTargetId}
          studentId={item.student?.id || null}
          studentName={item.student?.display_name || 'this user'}
          onBlocked={() => setHidden(true)}
        />
      )}
    </Pressable>
  );
}

// P4: memoize so stable feed items don't re-render when siblings change.
// Re-render only on identity or on the fields this card actually reads.
export const FeedCard = memo(FeedCardImpl, (prev, next) => {
  if (prev.showStudent !== next.showStudent) return false;
  if (prev.onPress !== next.onPress) return false;
  // isActive flips as the card scrolls in/out of view — must re-render so the
  // inline video pauses off-screen.
  if (prev.isActive !== next.isActive) return false;
  const a = prev.item;
  const b = next.item;
  // Multi-kid grouped posts: the `students` list can change (e.g. a sibling kid
  // added/removed) while every scalar field stays equal. Compare it explicitly,
  // or the card's avatars/names go stale (it showed combined then reverted to
  // the primary kid on Android, where FlatList remounts reveal the stale data).
  const aStudents = a.students || [];
  const bStudents = b.students || [];
  if (aStudents.length !== bStudents.length) return false;
  for (let i = 0; i < aStudents.length; i++) {
    if (aStudents[i]?.id !== bStudents[i]?.id) return false;
  }
  return (
    a.id === b.id &&
    a.views_count === b.views_count &&
    a.comments_count === b.comments_count &&
    a.is_confidential === b.is_confidential &&
    a.can_share === b.can_share &&
    a.timestamp === b.timestamp
  );
});

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
