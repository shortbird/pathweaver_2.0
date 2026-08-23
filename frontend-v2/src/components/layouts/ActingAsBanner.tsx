/**
 * ActingAsBanner - Persistent banner shown when a parent is acting as a
 * dependent. Renders at the top of the app content area with the target's name
 * and a "Switch Back" button.
 *
 * Masquerade is deliberately NOT shown here (see the early return below), so
 * this component only ever runs in 'dependent' mode. It used to carry a second
 * set of masquerade labels, colours and a stopMasquerade() branch underneath
 * that return — all unreachable, and all of it flagged by tsc as comparisons
 * with no overlap once the early return narrowed the type. Removed 2026-08-18.
 */

import React from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useActingAsStore } from '@/src/stores/actingAsStore';
import { useAuthStore } from '@/src/stores/authStore';
import { UIText } from '../ui/text';
import { useThemeColors } from '@/src/hooks/useThemeColors';

export function ActingAsBanner() {
  const c = useThemeColors();
  const { target, isActive, mode, switching, stopActingAs } = useActingAsStore();
  const user = useAuthStore((s) => s.user);
  const insets = useSafeAreaInsets();

  if (!isActive || !target) return null;
  // Banner is hidden during masquerade entirely — superadmin uses the avatar
  // menu's "Exit demo view" item to switch back, so the red bar would only
  // clutter screenshots without adding a useful exit path. We still show it
  // for legit parent → dependent acting-as.
  if (mode === 'masquerade') return null;

  // Prefer target store data, fall back to authStore user (populated after page reload)
  const displayName =
    `${target.first_name || ''} ${target.last_name || ''}`.trim() ||
    target.display_name ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.display_name ||
    'User';

  const handleSwitchBack = async () => {
    if (switching) return;
    // Swaps the tokens back and triggers a full page reload.
    await stopActingAs();
  };

  return (
    <View
      style={{
        backgroundColor: c.brand,
        paddingHorizontal: 16,
        paddingTop: insets.top + 10,
        paddingBottom: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Ionicons name="people" size={18} color="#FFFFFF" />
      <UIText size="sm" style={{ color: '#FFFFFF', flex: 1 }} className="font-poppins-medium">
        Acting as {displayName}
      </UIText>
      <Pressable
        onPress={handleSwitchBack}
        disabled={switching}
        accessibilityRole="button"
        accessibilityLabel="Switch back to your account"
        style={{
          backgroundColor: 'rgba(255,255,255,0.2)',
          paddingHorizontal: 12,
          paddingVertical: 6,
          borderRadius: 8,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
        }}
      >
        {switching ? (
          <ActivityIndicator size="small" color="#FFFFFF" />
        ) : (
          <>
            <Ionicons name="arrow-back" size={14} color="#FFFFFF" />
            <UIText size="xs" style={{ color: '#FFFFFF' }} className="font-poppins-semibold">
              Switch Back
            </UIText>
          </>
        )}
      </Pressable>
    </View>
  );
}
