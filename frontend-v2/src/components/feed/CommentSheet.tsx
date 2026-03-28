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
import {
  VStack, HStack, UIText, Heading, Avatar, AvatarFallbackText,
} from '../ui';

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
    setPosting(true);
    try {
      await postComment(
        isTask ? cleanId : null,
        isTask ? null : cleanId,
        text.trim(),
      );
      setText('');
      await fetchComments();
      onCommentPosted?.();
    } catch {
      // Error handled silently
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
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
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            maxHeight: '70%',
            minHeight: 300,
          }}
        >
          {/* Handle */}
          <View className="w-10 h-1 bg-surface-300 rounded-full self-center mt-3 mb-2" />

          {/* Header */}
          <HStack className="items-center justify-between px-6 pb-3">
            <Heading size="md">Comments</Heading>
            <Pressable onPress={onClose} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
              <Ionicons name="close" size={18} color="#6B7280" />
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
                  <UIText size="sm" className="text-typo-400">No comments yet. Be the first!</UIText>
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
                        <UIText size="xs" className="text-typo-300">{formatTime(c.created_at)}</UIText>
                      </HStack>
                      <UIText size="sm" className="text-typo-600">{c.comment_text}</UIText>
                    </VStack>
                  </HStack>
                );
              }}
            />
          )}

          {/* Input */}
          <HStack className="px-4 py-3 border-t border-surface-100 items-end gap-2" style={{ paddingBottom: Platform.OS === 'ios' ? 32 : 16 }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Add a comment..."
              placeholderTextColor="#9CA3AF"
              multiline
              className="flex-1 bg-surface-50 rounded-xl px-4 py-2.5 text-sm max-h-24"
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
