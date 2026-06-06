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
 * unmounting. On mobile the sheet's bottom padding tracks the soft-keyboard
 * height (via Keyboard events) so text inputs aren't covered — and always
 * resets to 0 on dismiss, avoiding the residual-gap bug KeyboardAvoidingView
 * exhibits inside a Modal.
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, Modal, Pressable, Keyboard, Platform, Animated, Dimensions, Easing, ScrollView, useWindowDimensions } from 'react-native';
import { useBreakpoint } from '@/src/hooks/useBreakpoint';
import { useThemeColors } from '@/src/hooks/useThemeColors';

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
  /** Fires once the close animation completes and the underlying Modal has
   *  unmounted. Use this to open a *second* sheet after this one — on iOS a new
   *  Modal won't present until the previous is fully gone, which is what caused
   *  the "tap the drawer action twice" bug. Deterministic replacement for a
   *  fixed close-delay timeout. */
  onClosed?: () => void;
}

export function BottomSheet({
  visible,
  onClose,
  children,
  dismissOnBackdropPress = true,
  onClosed,
}: BottomSheetProps) {
  const [mounted, setMounted] = useState(visible);
  const { isLargeScreen } = useBreakpoint();
  const { height: windowHeight } = useWindowDimensions();
  const c = useThemeColors();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const sheetOpacity = useRef(new Animated.Value(0)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  // Keyboard-driven bottom padding for the phone bottom sheet. We track the
  // keyboard height ourselves instead of using KeyboardAvoidingView, which —
  // inside a Modal on iOS — intermittently leaves residual padding after the
  // keyboard hides (the "buffer below the drawer" bug). Driving paddingBottom
  // off Keyboard events guarantees it returns to exactly 0 on dismiss.
  const keyboardPad = useRef(new Animated.Value(0)).current;
  // Latest onClosed, read without retriggering the animation effect.
  const onClosedRef = useRef(onClosed);
  onClosedRef.current = onClosed;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      Animated.parallel([
        // Fast, predictable entrance instead of a slow spring. The spring took
        // ~400ms to settle, so an early tap on a sheet option landed before the
        // button had risen into place and was missed — the "tap the drawer
        // option twice, the first tap doesn't register" report. A 220ms ease-out
        // puts the sheet at its final (hit-testable) position almost immediately.
        Animated.timing(translateY, {
          toValue: 0,
          duration: 220,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
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
        if (finished) {
          setMounted(false);
          // Modal is now fully unmounted — safe to present the next sheet.
          onClosedRef.current?.();
        }
      });
    }
  }, [visible]);

  // Track keyboard height → animate the sheet's bottom padding. Always settles
  // back to 0 on hide so no gap lingers below the sheet. Large-screen dialog is
  // centered + scrollable, so it doesn't need this.
  useEffect(() => {
    if (isLargeScreen) return;
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const animateTo = (toValue: number, duration: number) =>
      Animated.timing(keyboardPad, {
        toValue,
        duration: duration || 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    const onShow = (e: any) => animateTo(e?.endCoordinates?.height ?? 0, e?.duration);
    const onHide = (e: any) => animateTo(0, e?.duration);
    const subShow = Keyboard.addListener(showEvt, onShow);
    const subHide = Keyboard.addListener(hideEvt, onHide);
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [isLargeScreen, keyboardPad]);

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
              backgroundColor: c.card,
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
      {/* Bottom-anchored container; paddingBottom = keyboard height lifts the
          sheet above the soft keyboard and resets to 0 on dismiss (no lingering
          gap). Manual tracking is used because Android's adjustResize doesn't
          resize Modal windows and iOS KeyboardAvoidingView leaves residual pad. */}
      <Animated.View
        style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: keyboardPad }}
        pointerEvents="box-none"
      >
        <Animated.View
          style={{
            backgroundColor: c.card,
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
      </Animated.View>
    </Modal>
  );
}
