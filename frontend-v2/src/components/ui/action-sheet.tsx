/**
 * ActionSheet - a bottom-sheet list of actions, the standard mobile pattern for
 * an item's secondary actions (replaces a cramped inline button row).
 *
 * Rows are full-width and ~52px tall (≥44pt touch target). Destructive actions
 * render in red and are separated from safe actions by a divider, so Delete
 * can't be hit by accident.
 */

import React, { useRef } from 'react';
import { Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BottomSheet } from './bottom-sheet';
import { UIText } from './text';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export interface ActionSheetAction {
  key: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  destructive?: boolean;
  disabled?: boolean;
  onPress: () => void;
}

interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  actions: ActionSheetAction[];
}

export function ActionSheet({ visible, onClose, title, actions }: ActionSheetProps) {
  const c = useThemeColors();
  const safe = actions.filter((a) => !a.destructive);
  const destructive = actions.filter((a) => a.destructive);
  // Run the chosen action only AFTER this sheet's Modal has fully closed.
  // Firing it synchronously with onClose() presents a second Modal (e.g. the
  // Edit modal) while this one is still dismissing — which crashes on iOS.
  const pendingRef = useRef<(() => void) | null>(null);

  const renderRow = (a: ActionSheetAction) => (
    <Pressable
      key={a.key}
      onPress={() => {
        if (a.disabled) return;
        pendingRef.current = a.onPress;
        onClose();
      }}
      disabled={a.disabled}
      className="flex-row items-center gap-3 px-4 active:bg-surface-100 dark:active:bg-dark-surface-200"
      style={{ minHeight: 52, opacity: a.disabled ? 0.4 : 1 }}
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
        {title ? (
          <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400 px-4 pb-2 uppercase tracking-wider">
            {title}
          </UIText>
        ) : null}
        {safe.map(renderRow)}
        {destructive.length > 0 && safe.length > 0 ? (
          <View className="h-px bg-surface-200 dark:bg-dark-surface-300 my-1 mx-4" />
        ) : null}
        {destructive.map(renderRow)}
      </View>
    </BottomSheet>
  );
}
