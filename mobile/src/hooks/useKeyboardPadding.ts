/**
 * useKeyboardPadding - Animated bottom padding that tracks the soft keyboard.
 *
 * Expo SDK 53+ enforces edge-to-edge on Android, so the window no longer
 * resizes when the keyboard opens and `KeyboardAvoidingView behavior="height"`
 * leaves the keyboard covering bottom-anchored inputs (chat input bars, etc.).
 * Driving paddingBottom off Keyboard events works on every Android version and
 * always returns to exactly 0 on dismiss — same pattern as the shared
 * BottomSheet (see bottom-sheet.tsx).
 *
 * iOS callers should keep KeyboardAvoidingView behavior="padding", which works
 * there; use this hook for the Android branch.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, Keyboard, Platform } from 'react-native';

/**
 * @param extraWhenVisible Additional padding applied only while the keyboard is
 *   up, on top of its reported height. Padding *inside* the bottom-anchored bar
 *   is not a reliable gap on Android: the safe-area bottom inset collapses when
 *   the IME opens, and the reported IME height can fall short of what the
 *   keyboard actually covers, so that inner padding ends up under the keyboard.
 *   Space added here sits between the keyboard and the whole bar, so it always
 *   shows. Returns to exactly 0 on dismiss, like the base height.
 */
export function useKeyboardPadding(extraWhenVisible: number = 0): Animated.Value {
  const pad = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const animateTo = (toValue: number, duration?: number) =>
      Animated.timing(pad, {
        toValue,
        duration: duration || 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();
    const subShow = Keyboard.addListener(showEvt, (e: any) => {
      const height = e?.endCoordinates?.height ?? 0;
      animateTo(height > 0 ? height + extraWhenVisible : 0, e?.duration);
    });
    const subHide = Keyboard.addListener(hideEvt, (e: any) => animateTo(0, e?.duration));
    return () => {
      subShow.remove();
      subHide.remove();
    };
  }, [pad, extraWhenVisible]);

  return pad;
}
