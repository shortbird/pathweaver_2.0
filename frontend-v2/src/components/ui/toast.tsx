/**
 * ToastHost — global mount point for toast notifications.
 *
 * Mounted once in app/_layout.tsx (after the navigator, alongside
 * BugReportHost). Reads the live queue from toastStore and renders each toast
 * with an enter/exit animation and a per-toast auto-dismiss timer.
 *
 * To FIRE a toast you never touch this file — use the imperative `toast` API:
 *   import { toast } from '@/src/stores/toastStore';
 *   toast.success('Moment captured');
 */

import React, { useCallback, useEffect, useRef } from 'react';
import { Animated, Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useToastStore, toast, type Toast, type ToastType } from '@/src/stores/toastStore';
import { UIText } from './text';
import { useThemeColors } from '@/src/hooks/useThemeColors';

// react-native-web doesn't support the native animation driver.
const USE_NATIVE_DRIVER = Platform.OS !== 'web';

const STYLES: Record<ToastType, { icon: keyof typeof Ionicons.glyphMap; color: string }> = {
  success: { icon: 'checkmark-circle', color: '#3DA24A' },
  error: { icon: 'alert-circle', color: '#E73862' },   // optio-pink-dark
  info: { icon: 'information-circle', color: '#6D469B' }, // optio-purple
};

function ToastItem({ item }: { item: Toast }) {
  const anim = useRef(new Animated.Value(0)).current;
  const { icon, color } = STYLES[item.type];
  const c = useThemeColors();

  const close = useCallback(() => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 160,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start(() => useToastStore.getState().dismiss(item.id));
  }, [anim, item.id]);

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      friction: 9,
      tension: 80,
      useNativeDriver: USE_NATIVE_DRIVER,
    }).start();

    if (item.duration > 0) {
      const t = setTimeout(close, item.duration);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Animated.View
      style={{
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [-16, 0] }) },
        ],
        width: '100%',
        maxWidth: 480,
        marginBottom: 8,
        // Inline RN shadow props — NOT the `shadow-sm` className, which crashes
        // navigation on native (see project memory).
        shadowColor: '#1A1A2E',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.12,
        shadowRadius: 12,
        elevation: 6,
      }}
    >
      <Pressable
        onPress={close}
        accessibilityRole="alert"
        accessibilityLabel={item.title ? `${item.title}. ${item.message}` : item.message}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          backgroundColor: c.card,
          borderRadius: 14,
          borderLeftWidth: 4,
          borderLeftColor: color,
          paddingVertical: 12,
          paddingHorizontal: 14,
        }}
      >
        <Ionicons name={icon} size={22} color={color} />
        <View style={{ flex: 1, minWidth: 0 }}>
          {item.title ? (
            <UIText size="sm" className="font-poppins-semibold" numberOfLines={1}>
              {item.title}
            </UIText>
          ) : null}
          <UIText size="sm" className="text-typo-700 dark:text-dark-typo-700" numberOfLines={3}>
            {item.message}
          </UIText>
        </View>
        {item.action ? (
          <Pressable
            hitSlop={8}
            onPress={() => {
              item.action?.onPress();
              close();
            }}
          >
            <UIText size="sm" className="font-poppins-semibold" style={{ color }}>
              {item.action.label}
            </UIText>
          </Pressable>
        ) : null}
      </Pressable>
    </Animated.View>
  );
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  const insets = useSafeAreaInsets();

  if (toasts.length === 0) return null;

  return (
    <View
      // box-none: the container ignores touches, but each toast can still be
      // tapped. Without this the invisible full-width host would eat taps.
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: Math.max(insets.top, 12) + 8,
        left: 16,
        right: 16,
        zIndex: 9999,
        alignItems: 'center',
      }}
    >
      {toasts.map((t) => (
        <ToastItem key={t.id} item={t} />
      ))}
    </View>
  );
}

// Re-export the imperative API so callers can grab everything from the ui
// barrel: `import { toast, ToastHost } from '@/src/components/ui';`
export { toast };
