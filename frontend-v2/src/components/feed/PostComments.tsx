/**
 * PostComments - Inline comments list + composer for the post detail page.
 *
 * The feed card opens comments in a bottom sheet, but the post detail view
 * should show all comments inline (bug report: "Show all comments in post
 * view."). Shares the same fetch/post logic as CommentSheet.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { View, Pressable, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Image as ExpoImage } from 'expo-image';
import { postComment, getComments } from '@/src/hooks/useFeed';
import type { FeedItem } from '@/src/hooks/useFeed';
import { extractApiError } from '@/src/services/apiError';
import {
  VStack, HStack, UIText, Heading, Avatar, AvatarFallbackText,
} from '../ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

interface Comment {
  id: string;
  user_display_name?: string;
  comment_text: string;
  created_at: string;
  // Superadmin comments are surfaced as "Optio" with the platform logo.
  is_platform?: boolean;
}

export function PostComments({ item }: { item: FeedItem }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = useThemeColors();

  const isTask = item.type === 'task_completed';
  const cleanId = item.id.replace(/^(tc_|le_)/, '');

  const fetchComments = useCallback(async () => {
    try {
      const result = await getComments(item.type, item.id);
      setComments(result);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  }, [item.id, item.type]);

  useEffect(() => { fetchComments(); }, [fetchComments]);

  const handlePost = async () => {
    if (!text.trim() || posting) return;
    setError(null);
    setPosting(true);
    try {
      await postComment({
        studentId: item.student.id,
        completionId: isTask ? (item.completion_id || cleanId) : null,
        learningEventId: isTask ? null : (item.learning_event_id || cleanId),
        text: text.trim(),
      });
      setText('');
      await fetchComments();
    } catch (e) {
      setError(extractApiError(e, 'Could not post comment. Please try again.').message);
    } finally {
      setPosting(false);
    }
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  };

  return (
    <VStack space="sm" className="mt-4">
      <Heading size="sm">Comments</Heading>

      {loading ? (
        <View className="items-center py-6">
          <ActivityIndicator size="small" color="#6D469B" />
        </View>
      ) : comments.length === 0 ? (
        <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400 py-2">
          No comments yet. Be the first!
        </UIText>
      ) : (
        <VStack space="sm">
          {comments.map((cm) => {
            const initials = cm.user_display_name
              ?.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
            return (
              <HStack key={cm.id} className="gap-3 py-1.5">
                <Avatar size="xs">
                  {cm.is_platform ? (
                    <ExpoImage source={require('@/assets/images/icon.png')} style={{ width: '100%', height: '100%', backgroundColor: '#fff' }} contentFit="cover" />
                  ) : (
                    <AvatarFallbackText>{initials}</AvatarFallbackText>
                  )}
                </Avatar>
                <VStack className="flex-1">
                  <HStack className="items-center gap-2">
                    <UIText size="xs" className="font-poppins-semibold">
                      {cm.user_display_name || 'User'}
                    </UIText>
                    <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">{formatTime(cm.created_at)}</UIText>
                  </HStack>
                  <UIText size="sm" className="text-typo-600 dark:text-dark-typo-700">{cm.comment_text}</UIText>
                </VStack>
              </HStack>
            );
          })}
        </VStack>
      )}

      {error ? (
        <UIText size="xs" className="text-error-600 dark:text-error-400">{error}</UIText>
      ) : null}

      {/* Composer */}
      <HStack className="items-end gap-2 mt-1">
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Add a comment..."
          placeholderTextColor={c.textFaint}
          multiline
          className="flex-1 bg-surface-50 dark:bg-dark-surface-50 rounded-xl px-4 py-2.5 text-sm max-h-24 text-typo dark:text-dark-typo"
          style={{ fontFamily: 'Poppins_400Regular' }}
        />
        <Pressable
          onPress={handlePost}
          disabled={!text.trim() || posting}
          className="w-10 h-10 rounded-full bg-optio-purple items-center justify-center"
          style={{ opacity: !text.trim() || posting ? 0.5 : 1 }}
        >
          {posting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={18} color="#fff" />
          )}
        </Pressable>
      </HStack>
    </VStack>
  );
}
