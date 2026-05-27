/**
 * BottomSheet - Shared bottom-sheet drawer used by capture, feed menus,
 * evidence upload, and any other modal-from-bottom UI.
 *
 * Custom animation (not Modal's built-in slide, which moves the backdrop
 * with the sheet): backdrop fades while the sheet springs up from below.
 * `mounted` state keeps the Modal rendered through the close animation
 * before unmounting.
 *
 * Wraps content in KeyboardAvoidingView so sheets with text inputs
 * (capture, evidence upload) don't get covered by the soft keyboard.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, Pressable, KeyboardAvoidingView, Platform, Animated, Dimensions, Easing, ScrollView } from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Sheet content is bounded to this fraction of the screen and becomes
// scrollable beyond — without this, a sheet that grows (e.g. the capture
// sheet with the inline quest picker expanded) overflows offscreen and the
// user can't reach the bottom.
const MAX_CONTENT_HEIGHT = SCREEN_HEIGHT * 0.82;

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
  const [mounted, setMounted] = useState(visible);
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          damping: 22,
          stiffness: 240,
          mass: 0.9,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start();
    } else if (mounted) {
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 240,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (finished) setMounted(false);
      });
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      <Animated.View
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.45)',
          opacity: backdropOpacity,
        }}
      >
        <Pressable
          style={{ flex: 1 }}
          onPress={dismissOnBackdropPress ? onClose : undefined}
        />
      </Animated.View>
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        pointerEvents="box-none"
      >
        <Animated.View
          style={{
            backgroundColor: '#FFFFFF',
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            transform: [{ translateY }],
            maxHeight: MAX_CONTENT_HEIGHT,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: -4 },
            shadowOpacity: 0.12,
            shadowRadius: 16,
            elevation: 16,
          }}
        >
          <ScrollView
            contentContainerStyle={{
              paddingHorizontal: 24,
              paddingTop: 16,
              paddingBottom: 32,
            }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
