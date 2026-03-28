/**
 * ActingAsBanner - Persistent banner shown when parent is acting as a dependent
 * or admin is masquerading as a user.
 *
 * Renders at the top of the app content area. Shows target user info
 * and a "Switch Back" button.
 */

import React from 'react';
import { View, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useActingAsStore } from '@/src/stores/actingAsStore';
import { useAuthStore } from '@/src/stores/authStore';
import { UIText } from '../ui/text';

export function ActingAsBanner() {
  const { target, isActive, mode, switching, stopActingAs, stopMasquerade } = useActingAsStore();
  const user = useAuthStore((s) => s.user);

  if (!isActive || !target) return null;

  // Prefer target store data, fall back to authStore user (populated after page reload)
  const displayName =
    `${target.first_name || ''} ${target.last_name || ''}`.trim() ||
    target.display_name ||
    `${user?.first_name || ''} ${user?.last_name || ''}`.trim() ||
    user?.display_name ||
    'User';

  const label = mode === 'masquerade' ? 'Viewing as' : 'Acting as';
  const icon = mode === 'masquerade' ? 'shield-checkmark' : 'people';

  const handleSwitchBack = async () => {
    if (switching) return;
    // stop methods swap tokens back and trigger a full page reload
    if (mode === 'masquerade') {
      await stopMasquerade();
    } else {
      await stopActingAs();
    }
  };

  return (
    <View
      style={{
        backgroundColor: mode === 'masquerade' ? '#DC2626' : '#6D469B',
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <Ionicons name={icon as any} size={18} color="#FFFFFF" />
      <UIText size="sm" style={{ color: '#FFFFFF', flex: 1 }} className="font-poppins-medium">
        {label} {displayName}
      </UIText>
      <Pressable
        onPress={handleSwitchBack}
        disabled={switching}
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
