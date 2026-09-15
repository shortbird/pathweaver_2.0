/**
 * FamilyCover - the family photo across the top of the Family tab.
 *
 * A landscape banner the parent sets: with none, a quiet placeholder that
 * says a photo can go here; with one, the photo, and a tap opens Change /
 * Remove. The children's pictures sit on their cards below; this is the one
 * of everyone together (2026-09-15, with the web dashboard's).
 */

import React, { useState } from 'react';
import { ActivityIndicator, Image, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { ActionSheet, UIText } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';
import { useFamilyCover } from '@/src/hooks/useFamilyCover';
import { confirmAlert, showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';

export function FamilyCover() {
  const c = useThemeColors();
  const { url, loading, busy, upload, remove } = useFamilyCover();
  const [menuOpen, setMenuOpen] = useState(false);

  const pick = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.85,
      allowsEditing: true,
      aspect: [16, 9],
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    try {
      await upload({
        uri: asset.uri,
        name: asset.fileName || 'family.jpg',
        type: asset.mimeType || 'image/jpeg',
      });
    } catch (err) {
      showAlert('Error', extractApiError(err, 'Could not upload the photo.').message);
    }
  };

  const onRemove = async () => {
    const ok = await confirmAlert({ title: 'Remove the family photo?', confirmText: 'Remove', destructive: true });
    if (!ok) return;
    try {
      await remove();
    } catch (err) {
      showAlert('Error', extractApiError(err, 'Could not remove the photo.').message);
    }
  };

  if (loading) {
    return <View className="w-full rounded-2xl bg-surface-100 dark:bg-dark-surface-200" style={{ aspectRatio: 16 / 7 }} />;
  }

  if (!url) {
    return (
      <Pressable
        onPress={pick}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Add a family photo"
        className="w-full rounded-2xl border-2 border-dashed border-surface-300 dark:border-dark-surface-300 items-center justify-center active:opacity-70"
        style={{ aspectRatio: 16 / 7 }}
      >
        {busy ? (
          <ActivityIndicator color={c.brand} />
        ) : (
          <>
            <Ionicons name="camera-outline" size={28} color={c.iconMuted} />
            <UIText size="sm" className="font-poppins-medium text-typo-500 dark:text-dark-typo-500 mt-1">Add a family photo</UIText>
            <UIText size="xs" className="text-typo-400 dark:text-dark-typo-400">A wide picture works best</UIText>
          </>
        )}
      </Pressable>
    );
  }

  return (
    <>
      <Pressable
        onPress={() => setMenuOpen(true)}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel="Family photo. Change or remove it"
        className="w-full rounded-2xl overflow-hidden"
        style={{ aspectRatio: 16 / 7 }}
      >
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} resizeMode="cover" accessibilityLabel="Our family" />
        {busy && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <ActivityIndicator color="#FFFFFF" />
          </View>
        )}
        <View
          style={{
            position: 'absolute', bottom: 8, right: 8,
            width: 30, height: 30, borderRadius: 15,
            backgroundColor: 'rgba(0,0,0,0.45)', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Ionicons name="camera" size={15} color="#FFFFFF" />
        </View>
      </Pressable>
      <ActionSheet
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        title="Family photo"
        actions={[
          { key: 'change', label: 'Change photo', icon: 'image-outline', onPress: pick },
          { key: 'remove', label: 'Remove photo', icon: 'trash-outline', destructive: true, onPress: onRemove },
        ]}
      />
    </>
  );
}
