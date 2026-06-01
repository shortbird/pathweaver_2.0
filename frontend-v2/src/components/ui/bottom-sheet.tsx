/**
 * BottomSheet - Shared bottom-sheet drawer used by capture, feed menus,
 * evidence upload, and any other modal-from-bottom UI.
 *
 * On phones it springs up from the bottom (custom animation, not Modal's
 * built-in slide, which moves the backdrop with the sheet).
 *
 * On large screens (web desktop / tablet, >= 768px) a bottom sheet sliding the
 * full width of a wide window feels wrong, so it instead renders as a centered,
 * max-width dialog that fades + scales in. Every consumer of BottomSheet
 * (CaptureSheet, StartSomethingSheet, the create sheets, etc.) inherits this for
 * free — no per-sheet changes needed.
 *
 * `mounted` state keeps the Modal rendered through the close animation before
 * unmounting. Content is wrapped in KeyboardAvoidingView on mobile so sheets
 * with text inputs don't get covered by the soft keyboard.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, Pressable, KeyboardAvoidingView, Platform, Animated, Dimensions, Easing, ScrollView, useWindowDimensions } from 'react-native';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';

const SCREEN_HEIGHT = Dimensions.get('window').height;
// Sheet content is bounded to this fraction of the screen and becomes
// scrollable beyond — without this, a sheet that grows (e.g. the capture
// sheet with the inline quest picker expanded) overflows offscreen and the
// user can't reach the bottom.
const MAX_CONTENT_HEIGHT = SCREEN_HEIGHT * 0.82;
// Centered dialog width on large screens.
const DIALOG_MAX_WIDTH = 520;

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
  const { isLargeScreen } = useBreakpoint();
  const { height: windowHeight } = useWindowDimensions();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
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
        Animated.timing(sheetOpacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
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
        Animated.timing(sheetOpacity, {
          toValue: 0,
          duration: 160,
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

  const Backdrop = (
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
  );

  // ── Large screen: centered, max-width dialog ──
  if (isLargeScreen) {
    const scale = sheetOpacity.interpolate({
      inputRange: [0, 1],
      outputRange: [0.96, 1],
    });
    return (
      <Modal visible transparent animationType="none" onRequestClose={onClose}>
        {Backdrop}
        <View
          className="flex-1 items-center justify-center"
          style={{ padding: 24 }}
          pointerEvents="box-none"
        >
          <Animated.View
            style={{
              width: '100%',
              maxWidth: DIALOG_MAX_WIDTH,
              maxHeight: windowHeight * 0.85,
              backgroundColor: '#FFFFFF',
              borderRadius: 24,
              opacity: sheetOpacity,
              transform: [{ scale }],
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 28,
              elevation: 24,
            }}
          >
            <ScrollView
              contentContainerStyle={{
                paddingHorizontal: 24,
                paddingTop: 20,
                paddingBottom: 24,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>
    );
  }

  // ── Phone: bottom sheet ──
  return (
    <Modal visible transparent animationType="none" onRequestClose={onClose}>
      {Backdrop}
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
