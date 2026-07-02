/**
 * MessageActionsSheet - long-press menu for a message bubble.
 *
 * Top: the 6 allowed reaction emoji (tap toggles your reaction).
 * Below: contextual actions — Reply, Copy text, Edit (own messages),
 * Delete (own; group admins any group message), Pin/Unpin (group admins).
 *
 * Same bottom-sheet + deferred-action pattern as ui/action-sheet.tsx: the
 * chosen action runs only after the Modal has fully closed, so follow-up
 * modals (e.g. starting an edit) present reliably on iOS.
 */

import React, { useRef } from 'react';
import { Pressable, View, Clipboard } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet, UIText, toast } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { REACTION_EMOJI } from './MessageParts';
import type { Message } from '@/src/hooks/useMessages';

interface Props {
  visible: boolean;
  onClose: () => void;
  message: Message | null;
  isOwn: boolean;
  /** Own messages always; group admins may delete any group message. */
  canDelete: boolean;
  /** Group admins only (group chats). */
  canPin?: boolean;
  isPinned?: boolean;
  onReact: (emoji: string) => void;
  onReply: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onPin?: () => void;
}

interface Row {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  onPress: () => void;
}

export function MessageActionsSheet({
  visible,
  onClose,
  message,
  isOwn,
  canDelete,
  canPin,
  isPinned,
  onReact,
  onReply,
  onEdit,
  onDelete,
  onPin,
}: Props) {
  const c = useThemeColors();
  // Run the chosen action only AFTER the Modal has fully closed (iOS: a second
  // Modal can't present while this one is dismissing).
  const pendingRef = useRef<(() => void) | null>(null);

  if (!message) return null;

  const choose = (fn: () => void) => {
    pendingRef.current = fn;
    onClose();
  };

  const myReactions = new Set(
    (message.reactions || []).filter((r) => r.reacted).map((r) => r.emoji),
  );

  const rows: Row[] = [
    { key: 'reply', label: 'Reply', icon: 'arrow-undo-outline', onPress: onReply },
  ];
  if (message.message_content) {
    rows.push({
      key: 'copy',
      label: 'Copy text',
      icon: 'copy-outline',
      onPress: () => {
        Clipboard.setString(message.message_content);
        toast.success('Copied');
      },
    });
  }
  if (isOwn && onEdit) {
    rows.push({ key: 'edit', label: 'Edit', icon: 'pencil-outline', onPress: onEdit });
  }
  if (canPin && onPin) {
    rows.push({
      key: 'pin',
      label: isPinned ? 'Unpin' : 'Pin',
      icon: 'pin-outline',
      onPress: onPin,
    });
  }
  const destructive: Row[] = canDelete
    ? [{ key: 'delete', label: 'Delete', icon: 'trash-outline', destructive: true, onPress: onDelete }]
    : [];

  const renderRow = (a: Row) => (
    <Pressable
      key={a.key}
      onPress={() => choose(a.onPress)}
      className="flex-row items-center gap-3 px-4 active:bg-surface-100 dark:active:bg-dark-surface-200"
      style={{ minHeight: 52 }}
      accessibilityRole="button"
      accessibilityLabel={a.label}
    >
      <Ionicons name={a.icon} size={20} color={a.destructive ? '#EF4444' : '#6D469B'} />
      <UIText
        size="md"
        className={a.destructive ? 'text-red-500 font-poppins-medium' : 'font-poppins-medium'}
      >
        {a.label}
      </UIText>
    </Pressable>
  );

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      onClosed={() => {
        const run = pendingRef.current;
        pendingRef.current = null;
        run?.();
      }}
    >
      <View>
        {/* Reaction emoji row */}
        <View className="flex-row justify-between px-2 pb-3">
          {REACTION_EMOJI.map((emoji) => {
            const active = myReactions.has(emoji);
            return (
              <Pressable
                key={emoji}
                onPress={() => choose(() => onReact(emoji))}
                accessibilityRole="button"
                accessibilityLabel={`React ${emoji}`}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? '#EDE9F0' : c.surfaceMuted,
                  borderWidth: active ? 1 : 0,
                  borderColor: '#6D469B',
                }}
              >
                <UIText style={{ fontSize: 22 }}>{emoji}</UIText>
              </Pressable>
            );
          })}
        </View>
        <View className="h-px bg-surface-200 dark:bg-dark-surface-300 mb-1" />
        {rows.map(renderRow)}
        {destructive.length > 0 ? (
          <View className="h-px bg-surface-200 dark:bg-dark-surface-300 my-1 mx-4" />
        ) : null}
        {destructive.map(renderRow)}
      </View>
    </BottomSheet>
  );
}
