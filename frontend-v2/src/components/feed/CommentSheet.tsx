/**
 * CommentSheet - Bottom sheet for viewing and posting comments on feed items.
 */

import React, { useState, useEffect } from 'react';
import {
  View, Modal, Pressable, TextInput, KeyboardAvoidingView,
  Platform, FlatList, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
}

interface CommentSheetProps {
  visible: boolean;
  item: FeedItem;
  onClose: () => void;
  onCommentPosted?: () => void;
}

export function CommentSheet({ visible, item, onClose, onCommentPosted }: CommentSheetProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const c = useThemeColors();

  const isTask = item.type === 'task_completed';
  const cleanId = item.id.replace(/^(tc_|le_)/, '');

  useEffect(() => {
    if (visible) {
      fetchComments();
    }
  }, [visible]);

  const fetchComments = async () => {
    setLoading(true);
    try {
      const result = await getComments(item.type, item.id);
      setComments(result);
    } catch {
      // Non-critical
    } finally {
      setLoading(false);
    }
  };

  const handlePost = async () => {
    if (!text.trim() || posting) return;
    setError(null);
    setPosting(true);
    try {
      // Use the canonical completion/learning-event handle the feed provides
      // (item.id can be a composite "<completionId>_<blockId>" that isn't a real id).
      await postComment({
        studentId: item.student.id,
        completionId: isTask ? (item.completion_id || cleanId) : null,
        learningEventId: isTask ? null : (item.learning_event_id || cleanId),
        text: text.trim(),
      });
      setText('');
      await fetchComments();
      onCommentPosted?.();
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
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* Backdrop */}
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={onClose}
        />

        {/* Sheet */}
        <View
          style={{
            backgroundColor: c.card,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '70%',
            minHeight: 300,
          }}
        >
          {/* Handle */}
          <View className="w-10 h-1 bg-surface-300 dark:bg-dark-surface-300 rounded-full self-center mt-3 mb-2" />

          {/* Header */}
          <HStack className="items-center justify-between px-6 pb-3">
            <Heading size="md">Comments</Heading>
            <Pressable onPress={onClose} className="w-8 h-8 rounded-full bg-surface-100 dark:bg-dark-surface-200 items-center justify-center">
              <Ionicons name="close" size={18} color={c.icon} />
            </Pressable>
          </HStack>

          {/* Comments list */}
          {loading ? (
            <View className="items-center py-8">
              <ActivityIndicator size="small" color="#6D469B" />
            </View>
          ) : (
            <FlatList
              data={comments}
              keyExtractor={(c) => c.id}
              contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 8 }}
              ListEmptyComponent={
                <View className="items-center py-8">
                  <UIText size="sm" className="text-typo-400 dark:text-dark-typo-400">No comments yet. Be the first!</UIText>
                </View>
              }
              renderItem={({ item: c }) => {
                const initials = c.user_display_name
                  ?.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) || '?';
                return (
                  <HStack className="gap-3 py-2.5">
                    <Avatar size="xs">
                      <AvatarFallbackText>{initials}</AvatarFallbackText>
                    </Avatar>
                    <VStack className="flex-1">
                      <HStack className="items-center gap-2">
                        <UIText size="xs" className="font-poppins-semibold">
                          {c.user_display_name || 'User'}
                        </UIText>
                        <UIText size="xs" className="text-typo-300 dark:text-dark-typo-300">{formatTime(c.created_at)}</UIText>
                      </HStack>
                      <UIText size="sm" className="text-typo-600 dark:text-dark-typo-700">{c.comment_text}</UIText>
                    </VStack>
                  </HStack>
                );
              }}
            />
          )}

          {/* Error */}
          {error ? (
            <View className="px-6 pb-1">
              <UIText size="xs" className="text-error-600 dark:text-error-400">{error}</UIText>
            </View>
          ) : null}

          {/* Input */}
          <HStack className="px-4 py-3 border-t border-surface-100 dark:border-dark-surface-300 items-end gap-2" style={{ paddingBottom: Platform.OS === 'ios' ? 32 : 16 }}>
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
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
