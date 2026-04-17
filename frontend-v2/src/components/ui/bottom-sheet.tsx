/**
 * BottomSheet - Shared bottom-sheet drawer used by capture, feed menus,
 * evidence upload, and any other modal-from-bottom UI.
 *
 * Fixes the "dim backdrop slides up with the sheet" bug that happens with
 * React Native's Modal `animationType="slide"`: we disable that animation
 * and render the backdrop as a separate flex-1 Pressable outside the sheet,
 * so only the sheet itself animates in. The dim stays fixed.
 *
 * Also wraps the content in a KeyboardAvoidingView so sheets with text
 * inputs (capture, evidence upload) don't get covered by the soft keyboard.
 */

import React from 'react';
import { View, Modal, Pressable, KeyboardAvoidingView, Platform } from 'react-native';

export interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Tap-outside-to-close. Defaults to true. */
  dismissOnBackdropPress?: boolean;
}

export function BottomSheet({
  visible,
  onClose,
  children,
  dismissOnBackdropPress = true,
}: BottomSheetProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={dismissOnBackdropPress ? onClose : undefined}
        />
        <View
          style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingHorizontal: 24,
            paddingTop: 16,
            paddingBottom: 32,
          }}
        >
          <View className="w-10 h-1 bg-surface-300 rounded-full self-center mb-4" />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
