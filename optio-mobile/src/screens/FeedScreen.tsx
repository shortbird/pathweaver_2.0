/**
 * Feed Screen - Activity feed (read-only for students, interactive for observers).
 *
 * Shows chronological feed of task completions and learning moments.
 * Tapping a card navigates to FeedDetail for full evidence + comments.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Image,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { tokens, PillarKey } from '../theme/tokens';
import { SurfaceCard } from '../components/common/SurfaceCard';
import { GlassBackground } from '../components/common/GlassBackground';
import { ReactionBar } from '../components/feed/ReactionBar';
import { useAuthStore } from '../stores/authStore';
import { useThemeStore } from '../stores/themeStore';
import api from '../services/api';

/** Format pillar name for display: 'stem' -> 'STEM', others -> Title Case */
function formatPillar(pillar: string): string {
  if (pillar.toLowerCase() === 'stem') return 'STEM';
  return pillar.charAt(0).toUpperCase() + pillar.slice(1);
}

interface FeedStudent {
  id: string;
  display_name: string;
  avatar_url: string | null;
}

interface MediaItem {
  type: 'image' | 'video' | 'link' | 'document';
  url: string;
  title?: string | null;
}

export interface FeedItem {
  type: 'task_completed' | 'learning_moment';
  id: string;
  completion_id?: string;
  learning_event_id?: string;
  timestamp: string;
  student: FeedStudent;
  task?: {
    id: string;
    title: string;
    pillar: string;
    xp_value: number;
  };
  quest?: {
    id: string;
    title: string;
  };
  moment?: {
    title: string;
    description: string;
    pillars: string[];
    source_type: string;
  };
  evidence?: {
    type: string | null;
    url: string | null;
    preview_text: string | null;
    title: string | null;
  };
  media?: MediaItem[];
  xp_awarded?: number;
  likes_count: number;
  comments_count: number;
  user_has_liked: boolean;
}

export function FeedScreen() {
  const { user } = useAuthStore();
  const { colors } = useThemeStore();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);

  const loadFeed = useCallback(async (refresh = false) => {
    try {
      const params: Record<string, string> = { limit: '20' };
      if (!refresh && cursor) {
        params.cursor = cursor;
      }
      const response = await api.get('/api/observers/feed', { params });
      const data = response.data;

      if (refresh) {
        setItems(data.items || []);
      } else {
        setItems((prev) => [...prev, ...(data.items || [])]);
      }
      setHasMore(data.has_more || false);
      setCursor(data.next_cursor || null);
    } catch {
      // Feed may not be available for all roles
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [cursor]);

  useEffect(() => {
    loadFeed(true);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    setCursor(null);
    loadFeed(true);
  };

  const handleLoadMore = () => {
    if (hasMore && !loading) {
      loadFeed(false);
    }
  };

  if (loading) {
    return (
      <GlassBackground style={{ flex: 1 }}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={tokens.colors.primary} />
        </View>
      </GlassBackground>
    );
  }

  return (
    <GlassBackground style={styles.container}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Activity Feed</Text>
      </View>

      <FlatList
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <FeedCard item={item} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        onEndReached={handleLoadMore}
        onEndReachedThreshold={0.3}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No activity yet.</Text>
            <Text style={[styles.emptySubtext, { color: colors.textMuted }]}>
              {user?.role === 'student' || user?.org_role === 'student'
                ? 'Complete tasks and capture moments to see activity here.'
                : 'Follow students to see their learning activity.'}
            </Text>
          </View>
        }
      />
    </GlassBackground>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const { colors } = useThemeStore();
  const navigation = useNavigation<any>();
  const date = new Date(item.timestamp);
  const timeAgo = getTimeAgo(date);
  const [imageError, setImageError] = useState(false);

  const imageUrl = getPreviewImageUrl(item);

  const handlePress = () => {
    navigation.navigate('FeedDetail', { item });
  };

  return (
    <TouchableOpacity activeOpacity={0.85} onPress={handlePress}>
      <SurfaceCard style={styles.feedCard}>
        <View style={styles.feedHeader}>
          <View style={styles.avatarCircle}>
            {item.student.avatar_url ? (
              <Image source={{ uri: item.student.avatar_url }} style={styles.avatar} />
            ) : (
              <Text style={styles.avatarInitial}>
                {item.student.display_name?.charAt(0)?.toUpperCase() || '?'}
              </Text>
            )}
          </View>
          <View style={styles.feedHeaderText}>
            <Text style={[styles.studentName, { color: colors.text }]}>
              {item.student.display_name}
            </Text>
            <Text style={[styles.feedTime, { color: colors.textMuted }]}>{timeAgo}</Text>
          </View>
          {item.type === 'task_completed' && item.task?.pillar ? (
            <View
              style={[
                styles.pillarBadge,
                { backgroundColor: tokens.colors.pillars[item.task.pillar as PillarKey] || colors.textMuted },
              ]}
            >
              <Text style={styles.pillarBadgeText}>
                {formatPillar(item.task.pillar)}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Title above image */}
        {item.type === 'task_completed' && item.task ? (
          <Text style={[styles.feedTitle, { color: colors.text }]}>{item.task.title}</Text>
        ) : null}
        {item.type === 'learning_moment' && item.moment?.title ? (
          <Text style={[styles.feedTitle, { color: colors.text }]}>{item.moment.title}</Text>
        ) : null}

        {/* Evidence image -- hidden if load fails */}
        {imageUrl && !imageError ? (
          <Image
            source={{ uri: imageUrl }}
            style={styles.evidenceImage}
            resizeMode="cover"
            onError={() => setImageError(true)}
          />
        ) : null}

        {item.type === 'task_completed' && item.task ? (
          <View style={styles.feedBody}>
            {item.quest ? (
              <Text style={[styles.feedQuest, { color: colors.textSecondary }]}>
                in {item.quest.title}
              </Text>
            ) : null}
            {item.xp_awarded ? (
              <Text style={styles.xpBadge}>+{item.xp_awarded} XP</Text>
            ) : null}
          </View>
        ) : null}

        {item.type === 'learning_moment' && item.moment ? (
          <View style={styles.feedBody}>
            <Text style={[styles.feedDescription, { color: colors.textSecondary }]} numberOfLines={3}>
              {item.moment.description}
            </Text>
            {/* Additional media count indicator */}
            {(item.media?.length ?? 0) > 1 ? (
              <Text style={[styles.mediaCount, { color: colors.textMuted }]}>
                +{(item.media?.length ?? 0) - 1} more
              </Text>
            ) : null}
            <View style={styles.momentPillars}>
              {item.moment.pillars?.map((p) => (
                <View
                  key={p}
                  style={[
                    styles.momentPillarDot,
                    { backgroundColor: tokens.colors.pillars[p as PillarKey] || colors.textMuted },
                  ]}
                />
              ))}
            </View>
          </View>
        ) : null}

        {/* Evidence text preview (task completions only -- moment description already shows text) */}
        {!imageUrl && item.type === 'task_completed' && item.evidence?.preview_text ? (
          <View style={[styles.textPreview, { backgroundColor: colors.surface }]}>
            <Text style={[styles.textPreviewContent, { color: colors.textSecondary }]} numberOfLines={3}>
              {item.evidence.preview_text}
            </Text>
          </View>
        ) : null}

        <View style={[styles.feedFooter, { borderTopColor: colors.border }]}>
          <Text style={[styles.footerStat, { color: colors.textMuted }]}>
            {item.likes_count} {item.likes_count === 1 ? 'like' : 'likes'}
          </Text>
          <Text style={[styles.footerStat, { color: colors.textMuted }]}>
            {item.comments_count} {item.comments_count === 1 ? 'comment' : 'comments'}
          </Text>
        </View>

        <ReactionBar
          targetType={item.type === 'task_completed' ? 'completion' : 'learning_event'}
          targetId={
            item.type === 'task_completed'
              ? (item.completion_id || item.id)
              : (item.learning_event_id || item.id)
          }
        />
      </SurfaceCard>
    </TouchableOpacity>
  );
}

/** Extract the best preview image URL from a feed item. */
function getPreviewImageUrl(item: FeedItem): string | null {
  // Check media array first (learning moments with multiple items)
  if (item.media && item.media.length > 0) {
    const img = item.media.find((m) => m.type === 'image');
    if (img?.url) return img.url;
    // Fall back to first media item if it's a video thumbnail or other visual
    const visual = item.media.find((m) => m.type === 'video');
    if (visual?.url) return null; // Don't show video URLs as images
  }

  // Check evidence object
  if (item.evidence?.type === 'image' && item.evidence.url) {
    return item.evidence.url;
  }

  return null;
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
    paddingTop: 60,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    paddingHorizontal: tokens.spacing.md,
    marginBottom: tokens.spacing.md,
  },
  title: {
    fontSize: tokens.typography.sizes.xl,
    fontFamily: tokens.typography.fonts.bold,
  },
  listContent: {
    paddingHorizontal: tokens.spacing.md,
    paddingBottom: tokens.spacing.xxl,
  },
  feedCard: {
    marginBottom: tokens.spacing.md,
  },
  feedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: tokens.spacing.sm,
  },
  avatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: tokens.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarInitial: {
    color: '#FFF',
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.bold,
  },
  feedHeaderText: {
    flex: 1,
    marginLeft: tokens.spacing.sm,
  },
  studentName: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.semiBold,
  },
  feedTime: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
  },
  pillarBadge: {
    borderRadius: tokens.radius.full,
    paddingVertical: 2,
    paddingHorizontal: tokens.spacing.sm,
  },
  pillarBadgeText: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.medium,
    color: '#FFF',
  },

  // Evidence image
  evidenceImage: {
    width: '100%',
    height: 200,
    borderRadius: tokens.radius.md,
    marginBottom: tokens.spacing.sm,
  },

  // Text evidence preview
  textPreview: {
    borderRadius: tokens.radius.md,
    padding: tokens.spacing.sm,
    marginBottom: tokens.spacing.sm,
  },
  textPreviewContent: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    lineHeight: 20,
    fontStyle: 'italic',
  },

  feedBody: {
    marginBottom: tokens.spacing.sm,
  },
  feedAction: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
    marginBottom: tokens.spacing.xs,
  },
  feedTitle: {
    fontSize: tokens.typography.sizes.md,
    fontFamily: tokens.typography.fonts.semiBold,
    marginBottom: tokens.spacing.xs,
  },
  feedQuest: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    fontStyle: 'italic',
  },
  feedDescription: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    lineHeight: 20,
  },
  mediaCount: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.medium,
    marginTop: tokens.spacing.xs,
  },
  momentPillars: {
    flexDirection: 'row',
    gap: tokens.spacing.xs,
    marginTop: tokens.spacing.sm,
  },
  momentPillarDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  xpBadge: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.bold,
    color: tokens.colors.accent,
    marginTop: tokens.spacing.xs,
  },
  feedFooter: {
    flexDirection: 'row',
    gap: tokens.spacing.md,
    paddingTop: tokens.spacing.sm,
    borderTopWidth: 1,
  },
  footerStat: {
    fontSize: tokens.typography.sizes.xs,
    fontFamily: tokens.typography.fonts.regular,
  },
  emptyState: {
    alignItems: 'center',
    paddingTop: tokens.spacing.xxl,
  },
  emptyText: {
    fontSize: tokens.typography.sizes.lg,
    fontFamily: tokens.typography.fonts.medium,
    marginBottom: tokens.spacing.sm,
  },
  emptySubtext: {
    fontSize: tokens.typography.sizes.sm,
    fontFamily: tokens.typography.fonts.regular,
    textAlign: 'center',
    paddingHorizontal: tokens.spacing.lg,
  },
});
