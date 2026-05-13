/**
 * Preview Role Banner - Surfaced at the top of every screen when a superadmin
 * has selected a preview role. Reminds them they're viewing the app as a
 * different role and offers a one-tap exit.
 */

import React from 'react';
import { View, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/src/stores/authStore';
import { usePreviewRoleStore } from '@/src/stores/previewRoleStore';
import { UIText } from '@/src/components/ui/text';

const ROLE_LABEL: Record<string, string> = {
  parent: 'Parent',
  student: 'Student',
  observer: 'Observer',
};

export function PreviewRoleBanner() {
  const user = useAuthStore((s) => s.user);
  const previewRole = usePreviewRoleStore((s) => s.previewRole);
  const setPreviewRole = usePreviewRoleStore((s) => s.setPreviewRole);

  // Only render for superadmins with an active preview
  if (user?.role !== 'superadmin' || !previewRole) return null;

  return (
    <View
      style={{
        backgroundColor: '#6D469B',
        paddingHorizontal: 16,
        paddingVertical: 6,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
        <Ionicons name="eye-outline" size={14} color="#FFFFFF" />
        <UIText size="xs" style={{ color: '#FFFFFF', fontFamily: 'Poppins_500Medium' }} numberOfLines={1}>
          Previewing as {ROLE_LABEL[previewRole] || previewRole}
        </UIText>
      </View>
      <Pressable
        onPress={() => setPreviewRole(null)}
        style={{
          backgroundColor: 'rgba(255,255,255,0.18)',
          paddingHorizontal: 10,
          paddingVertical: 4,
          borderRadius: 12,
        }}
      >
        <UIText size="xs" style={{ color: '#FFFFFF', fontFamily: 'Poppins_600SemiBold' }}>
          Exit preview
        </UIText>
      </Pressable>
    </View>
  );
}
