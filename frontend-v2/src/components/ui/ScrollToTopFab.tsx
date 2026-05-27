/**
 * ScrollToTopFab - small circular button that fades in once the user has
 * scrolled past `threshold` and disappears when they're back near the top.
 *
 * Usage:
 *   const [showTop, setShowTop] = useState(false);
 *   const ref = useRef<ScrollView>(null);
 *
 *   <ScrollView
 *     ref={ref}
 *     onScroll={(e) => setShowTop(e.nativeEvent.contentOffset.y > 600)}
 *     scrollEventThrottle={64}
 *   >...</ScrollView>
 *
 *   <ScrollToTopFab
 *     visible={showTop}
 *     onPress={() => ref.current?.scrollTo({ y: 0, animated: true })}
 *   />
 *
 * For FlatList, replace the onPress with `ref.current?.scrollToOffset({ offset: 0, animated: true })`.
 *
 * Defaults to sitting above the 85pt mobile tab bar (bottomOffset = 100).
 * Pages without a tab bar (e.g. quest detail) should pass a smaller offset.
 */

import React, { useEffect, useRef } from 'react';
import { Pressable, Animated, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

interface Props {
  visible: boolean;
  onPress: () => void;
  /** Distance from the bottom of the screen, in px. Default 100 (clears the
   *  mobile bottom tab bar). Set lower on screens that don't have a tab bar. */
  bottomOffset?: number;
}

export function ScrollToTopFab({ visible, onPress, bottomOffset = 100 }: Props) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, {
        toValue: visible ? 1 : 0,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: visible ? 0 : 16,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [visible, opacity, translateY]);

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={{
        position: 'absolute',
        right: 16,
        bottom: bottomOffset,
        opacity,
        transform: [{ translateY }],
        // Keep above the tab bar's z-stack but below modal sheets.
        zIndex: 5,
      }}
    >
      {/* Background + shadow on a plain View. Pressable above only handles
          tap — its style-function return wasn't applying the backgroundColor
          on some RN/Expo combos, so we keep the visual layer in a View. */}
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 24,
          backgroundColor: '#1F1F2E',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#000',
          shadowOpacity: 0.6,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 6 },
          elevation: 12,
        }}
      >
        <Pressable
          onPress={onPress}
          accessibilityLabel="Scroll to top"
          hitSlop={8}
          style={{
            width: 48,
            height: 48,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Ionicons name="arrow-up" size={22} color="#FFFFFF" />
        </Pressable>
      </View>
    </Animated.View>
  );
}
