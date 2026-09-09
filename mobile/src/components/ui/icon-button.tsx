/**
 * IconButton — an icon-only tappable button that always meets mobile touch-target
 * guidelines (iOS HIG 44pt / Android 48dp) regardless of how small the icon or
 * the visible chip is.
 *
 * The visible size is decoupled from the touch area: we render the chip at
 * `size` (default 40) but expand the pressable hit region with `hitSlop` so the
 * real target is at least 48×48. Use this instead of a bare
 * `<Pressable className="w-8 h-8"><Ionicons size={14}/></Pressable>`, which is a
 * 32px target with no slop and is easy to miss (or mis-tap into a neighbor — the
 * masquerade-next-to-delete problem).
 */

import React from 'react';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/src/hooks/useThemeColors';

const MIN_HIT = 48; // Android Material min; also satisfies iOS 44pt.

const TONES = {
  default: 'bg-surface-100 dark:bg-dark-surface-200 active:bg-surface-200 dark:active:bg-dark-surface-300',
  danger: 'bg-red-50 dark:bg-red-950 active:bg-red-100 dark:active:bg-red-900',
  plain: 'active:opacity-60',
} as const;

export interface IconButtonProps {
  name: keyof typeof Ionicons.glyphMap;
  onPress: (e?: any) => void;
  /** Required so the control is announced to screen readers. */
  accessibilityLabel: string;
  /** Glyph size (default 18). */
  iconSize?: number;
  /** Visible chip diameter (default 40). Hit area is padded to >= 48. */
  size?: number;
  color?: string;
  tone?: keyof typeof TONES;
  disabled?: boolean;
  style?: any;
}

export function IconButton({
  name,
  onPress,
  accessibilityLabel,
  iconSize = 18,
  size = 40,
  color,
  tone = 'default',
  disabled,
  style,
}: IconButtonProps) {
  const c = useThemeColors();
  const slop = Math.max(0, Math.round((MIN_HIT - size) / 2));
  const resolved = color || (tone === 'danger' ? '#EF4444' : c.icon);
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      hitSlop={slop}
      className={`rounded-xl items-center justify-center ${TONES[tone]}`}
      style={[{ width: size, height: size, opacity: disabled ? 0.5 : 1 }, style]}
    >
      <Ionicons name={name} size={iconSize} color={resolved} />
    </Pressable>
  );
}
