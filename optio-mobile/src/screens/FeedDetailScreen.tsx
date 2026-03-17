/**
 * Feed Detail Screen - Full view of a feed item with evidence gallery,
 * reactions, and comments.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Dimensions,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { tokens, PillarKey } from '../theme/tokens';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { GlassBackground } from '../components/common/GlassBackground';
import { ReactionBar } from '../components/feed/ReactionBar';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import api from '../services/api';
import type { FeedItem } from './FeedScreen';

function formatPillar(pillar: string): string {
  if (pillar.toLowerCase() === 'stem') return 'STEM';
  return pillar.charAt(0).toUpperCase() + pillar.slice(1);
}

const SCREEN_W = Dimensions.get('window').width;
const IMAGE_HEIGHT = 300;

interface Comment {
  id: string;
  observer_id: string;
  comment_text: string;
  created_at: string;
  observer?: {
    display_name?: string;
    first_name?: string;
    last_name?: string;
    avatar_url?: string | null;
  };
}

export function FeedDetailScreen() {
  const route = useRoute<any>();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const { colors } = useThemeStore();
  const item: FeedItem = route.params.item;

  const [comments, setComments] = useState<Comment[]>([]);
  const [loadingComments, setLoadingComments] = useState(true);
  const [newComment, setNewComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const isTaskCompleted = item.type === 'task_completed';
  const entityId = isTaskCompleted
    ? (item.completion_id || item.id)
    : (item.learning_event_id || item.id);

  // Collect all displayable images, filtering out failed ones
  const allImages: string[] = [];
  if (item.media && item.media.length > 0) {
    for (const m of item.media) {
      if (m.type === 'image' && m.url) allImages.push(m.url);
    }
  }
  if (allImages.length === 0 && item.evidence?.type === 'image' && item.evidence.url) {
    allImages.push(item.evidence.url);
  }
  const images = allImages.filter((url) => !failedImages.has(url));

  const handleImageError = (url: string) => {
    setFailedImages((prev) => new Set(prev).add(url));
  };

  // Collect link/video/document items
  const links: { type: string; url: string; title?: string | null }[] = [];
  if (item.media && item.media.length > 0) {
    for (const m of item.media) {
      if (m.type !== 'image' && m.url) {
        links.push({ type: m.type, url: m.url, title: m.title });
      }
    }
  } else if (item.evidence?.type && item.evidence.type !== 'image' && item.evidence.type !== 'text' && item.evidence.url) {
    links.push({ type: item.evidence.type, url: item.evidence.url, title: item.evidence.title });
  }

  const loadComments = useCallback(async () => {
    try {
      const endpoint = isTaskCompleted
        ? `/api/observers/completions/${entityId}/comments`
        : `/api/observers/learning-events/${entityId}/comments`;
      const response = await api.get(endpoint);
      setComments(response.data.comments || []);
    } catch {
      // Comments may not be available
    } finally {
      setLoadingComments(false);
    }
  }, [entityId, isTaskCompleted]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handlePostComment = async () => {
    const text = newComment.trim();
    if (!text) return;
    setPosting(true);
    try {
      const endpoint = isTaskCompleted
        ? `/api/observers/completions/${entityId}/comments`
        : `/api/observers/learning-events/${entityId}/comments`;
      await api.post(endpoint, { comment_text: text });
      setNewComment('');
      loadComments();
    } catch {
      // Silent fail
    } finally {
      setPosting(false);
    }
  };

  const handleOpenLink = (url: string) => {
    Linking.openURL(url).catch(() => {});
  };

  const date = new Date(item.timestamp);

  return (
    <GlassBackground style={{ flex: 1 }}>
      <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
        {/* Back button */}
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>

        {/* Student header */}
        <View style={styles.studentRow}>
          <View style={styles.avatarCircle}>
            {item.student.avatar_url ? (
              <Image source={{ uri: item.student.avatar_url }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarInitial}>
                {item.student.display_name?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            )}
          </View>
          <View style={styles.studentInfo}>
            <Text style={[styles.studentName, { color: colors.text }]}>
              {item.student.display_name}
            </Text>
            <Text style={[styles.timestamp, { color: colors.textMuted }]}>
              {date.toLocaleDateString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>

        {/* Title above gallery */}
        {isTaskCompleted && item.task ? (
          <Text style={[styles.contentTitle, { color: colors.text }]}>{item.task.title}</Text>
        ) : null}
        {!isTaskCompleted && item.moment?.title ? (
          <Text style={[styles.contentTitle, { color: colors.text }]}>{item.moment.title}</Text>
        ) : null}

        {/* Image gallery */}
        {images.length > 0 && (
          <View style={styles.gallery}>
            <ScrollView
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onMomentumScrollEnd={(e) => {
                const idx = Math.round(e.nativeEvent.contentOffset.x / (SCREEN_W - 32));
                setActiveImageIndex(idx);
              }}
            >
              {images.map((url, i) => (
                <Image
                  key={url}
                  source={{ uri: url }}
                  style={[styles.galleryImage, { width: SCREEN_W - 32 }]}
                  resizeMode="cover"
                  onError={() => handleImageError(url)}
                />
              ))}
            </ScrollView>
            {images.length > 1 && (
              <View style={styles.paginationDots}>
                {images.map((_, i) => (
                  <View
                    key={i}
                    style={[
                      styles.dot,
                      {
                        backgroundColor:
                          i === activeImageIndex ? colors.primary : colors.textMuted,
                      },
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Content card */}
        <SurfaceCard style={styles.contentCard}>
          {isTaskCompleted && item.task ? (
            <>
              {item.quest ? (
                <Text style={[styles.questName, { color: colors.textSecondary }]}>
                  in {item.quest.title}
                </Text>
              ) : null}
              <View style={styles.metaRow}>
                {item.task.pillar ? (
                  <View
                    style={[
                      styles.pillarChip,
                      {
                        backgroundColor:
                          tokens.colors.pillars[item.task.pillar as PillarKey] || colors.textMuted,
                      },
                    ]}
                  >
                    <Text style={styles.pillarChipText}>
                      {formatPillar(item.task.pillar)}
                    </Text>
                  </View>
                ) : null}
                {item.xp_awarded ? (
                  <Text style={styles.xpBadge}>+{item.xp_awarded} XP</Text>
                ) : null}
              </View>
            </>
          ) : null}

          {!isTaskCompleted && item.moment ? (
            <>
              {item.moment.description ? (
                <Text style={[styles.description, { color: colors.textSecondary }]}>
                  {item.moment.description}
                </Text>
              ) : null}
              {item.moment.pillars?.length > 0 && (
                <View style={styles.metaRow}>
                  {item.moment.pillars.map((p) => (
                    <View
                      key={p}
                      style={[
                        styles.pillarChip,
                        {
                          backgroundColor:
                            tokens.colors.pillars[p as PillarKey] || colors.textMuted,
                        },
                      ]}
                    >
                      <Text style={styles.pillarChipText}>
                        {formatPillar(p)}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : null}

          {/* Text evidence (task completions only -- moment description already shows it) */}
          {isTaskCompleted && item.evidence?.type === 'text' && item.evidence.preview_text ? (
            <View style={[styles.textEvidence, { backgroundColor: colors.surface }]}>
              <Text style={[styles.textEvidenceContent, { color: colors.textSecondary }]}>
                {item.evidence.preview_text}
              </Text>
            </View>
          ) : null}

          {/* Links / videos / documents */}
          {links.length > 0 && (
            <View style={styles.linksSection}>
              {links.map((link, i) => (
                <TouchableOpacity
                  key={i}
                  style={[styles.linkRow, { borderColor: colors.border }]}
                  onPress={() => handleOpenLink(link.url)}
                >
                  <Ionicons
                    name={
                      link.type === 'video'
                        ? 'play-circle-outline'
                        : link.type === 'document'
                          ? 'document-outline'
                          : 'link-outline'
                    }
                    size={20}
                    color={colors.primary}
                  />
                  <Text
                    style={[styles.linkText, { color: colors.primary }]}
                    numberOfLines={1}
                  >
                    {link.title || link.url}
                  </Text>
                  <Ionicons name="open-outline" size={16} color={colors.textMuted} />
                </TouchableOpacity>
              ))}
            </View>
          )}
        </SurfaceCard>

        {/* Reactions */}
        <SurfaceCard style={styles.reactionsCard}>
          <ReactionBar
            targetType={isTaskCompleted ? 'completion' : 'learning_event'}
            targetId={entityId}
          />
        </SurfaceCard>

        {/* Comments */}
        <SurfaceCard style={styles.commentsCard}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Comments ({comments.length})
          </Text>

          {loadingComments ? (
            <ActivityIndicator color={colors.primary} style={{ marginVertical: tokens.spacing.md }} />
          ) : comments.length === 0 ? (
            <Text style={[styles.noComments, { color: colors.textMuted }]}>
              No comments yet. Be the first to share encouragement!
            </Text>
          ) : (
            comments.map((c) => (
              <View key={c.id} style={[styles.commentRow, { borderTopColor: colors.border }]}>
                <View style={styles.commentHeader}>
                  <Text style={[styles.commentAuthor, { color: colors.text }]}>
                    {c.observer?.display_name ||
                      [c.observer?.first_name, c.observer?.last_name].filter(Boolean).join(' ') ||
                      'Someone'}
                  </Text>
                  <Text style={[styles.commentTime, { color: colors.textMuted }]}>
                    {getTimeAgo(new Date(c.created_at))}
                  </Text>
                </View>
                <Text style={[styles.commentText, { color: colors.textSecondary }]}>
                  {c.comment_text}
                </Text>
              </View>
            ))
          )}

          {/* Comment input */}
          <View style={[styles.commentInput, { borderTopColor: colors.border }]}>
            <TextInput
              style={[
                styles.input,
                { color: colors.text, borderColor: colors.glass.border, backgroundColor: colors.inputBg },
              ]}
              placeholder="Write a comment..."
              placeholderTextColor={colors.textMuted}
              value={newComment}
              onChangeText={setNewComment}
              multiline
            />
            <TouchableOpacity
              style={[styles.sendButton, (!newComment.trim() || posting) && styles.sendButtonDisabled]}
              onPress={handlePostComment}
              disabled={!newComment.trim() || posting}
            >
              {posting ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <Ionicons name="send" size={18} color="#FFF" />
              )}
            </TouchableOpacity>
          </View>
        </SurfaceCard>
      </ScrollView>
    </GlassBackground>
  );
}

function getTimeAgo(date: Date): string {
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingTop: 50,
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.xxl + 40,
  },
  backButton: {
    marginBottom: tokens.spacing.md,
    padding: tokens.spacing.xs,
    alignSelf: 'flex-start',
  },

  // Student header
  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: tokens.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarInitial: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.bold,
  },
  studentInfo: {
    flex: 1,
  },
  studentName: {
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  timestamp: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
  },

  // Gallery
  gallery: {
    marginBottom: tokens.spacing.md,
  },
  galleryImage: {
    height: IMAGE_HEIGHT,
    borderRadius: tokens.radius.lg,
  },
  paginationDots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },

  // Content
  contentCard: {
    marginBottom: tokens.spacing.md,
  },
  label: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    marginBottom: tokens.spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  contentTitle: {
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.semiBold,
    marginBottom: tokens.spacing.xs,
  },
  questName: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    fontStyle: 'italic',
    marginBottom: tokens.spacing.sm,
  },
  description: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    lineHeight: 22,
    marginBottom: tokens.spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.sm,
  },
  pillarChip: {
    borderRadius: tokens.radius.full,
    paddingVertical: 3,
    paddingHorizontal: tokens.spacing.sm,
  },
  pillarChipText: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.medium,
    color: '#FFF',
  },
  xpBadge: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.bold,
    color: tokens.colors.accent,
  },

  // Text evidence
  textEvidence: {
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.md,
    marginTop: tokens.spacing.md,
  },
  textEvidenceContent: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    lineHeight: 22,
    fontStyle: 'italic',
  },

  // Links
  linksSection: {
    marginTop: tokens.spacing.md,
    gap: tokens.spacing.sm,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    padding: tokens.spacing.sm,
    borderWidth: 1,
    borderRadius: tokens.radius.md,
  },
  linkText: {
    flex: 1,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.medium,
  },

  // Reactions
  reactionsCard: {
    marginBottom: tokens.spacing.md,
  },

  // Comments
  commentsCard: {
    marginBottom: tokens.spacing.md,
  },
  sectionTitle: {
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.semiBold,
    marginBottom: tokens.spacing.sm,
  },
  noComments: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    textAlign: 'center',
    paddingVertical: tokens.spacing.md,
  },
  commentRow: {
    paddingVertical: tokens.spacing.sm,
    borderTopWidth: 1,
  },
  commentHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: tokens.spacing.xs,
  },
  commentAuthor: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  commentTime: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
  },
  commentText: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    lineHeight: 20,
  },
  commentInput: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: tokens.spacing.sm,
    marginTop: tokens.spacing.md,
    paddingTop: tokens.spacing.md,
    borderTopWidth: 1,
  },
  input: {
    flex: 1,
    borderWidth: 0.5,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.sm,
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
