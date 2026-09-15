/**
 * ChildAvatar - a child's picture, tap to set it.
 *
 * A parent said she could not change her son's photo: the only control was
 * a "Change photo" row behind a menu nobody finds. So the picture takes the
 * tap it already looks like it should take, and a camera badge says so --
 * the badge is the whole point; without it the photo reads as decoration
 * and the parent never tries. The child's profile screen and the family
 * dashboard's cards both use this one component, so the picker, the upload
 * (uploadChildAvatar, which takes a managed dependent and a linked student
 * alike) and the refresh of the family list live in one place.
 */

import React, { useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { uploadChildAvatar } from '@/src/services/api';
import { useAddKidStore } from '@/src/stores/familyStore';
import { showAlert } from '@/src/utils/alerts';
import { extractApiError } from '@/src/services/apiError';
import { Avatar, AvatarFallbackText, AvatarImage } from '@/src/components/ui';
import { useThemeColors } from '@/src/hooks/useThemeColors';

type AvatarSize = 'md' | 'lg' | 'xl';
const BADGE: Record<AvatarSize, { box: number; icon: number }> = {
  md: { box: 20, icon: 11 },
  lg: { box: 24, icon: 13 },
  xl: { box: 32, icon: 16 },
};

/**
 * Pick an image and upload it as this child's picture. Resolves to the new
 * URL, or null when the parent backed out of the picker; throws on a failed
 * upload (the caller shows the error). Exported so a sheet can run it AFTER
 * it has closed -- on iOS the picker will not present over an open Modal.
 */
export async function pickChildAvatar(childId: string): Promise<string | null> {
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    quality: 0.8,
    allowsEditing: true,
    aspect: [1, 1],
  });
  if (result.canceled || !result.assets[0]) return null;
  const asset = result.assets[0];
  const body = await uploadChildAvatar(childId, {
    uri: asset.uri,
    name: asset.fileName || 'avatar.jpg',
    type: asset.mimeType || 'image/jpeg',
  });
  // The Family tab reads children from the family store; refresh it too,
  // or the new photo shows here and nowhere else.
  useAddKidStore.getState().refreshChildren();
  return body?.avatar_url || asset.uri;
}

interface ChildAvatarProps {
  childId: string;
  /** For the accessibility label: "Change Romney's profile picture". */
  firstName: string;
  avatarUrl: string | null | undefined;
  initials: string;
  size?: AvatarSize;
  /** Called after a successful upload with the new URL (the screen refetches). */
  onUploaded?: (url: string | null) => void;
}

export function ChildAvatar({ childId, firstName, avatarUrl, initials, size = 'xl', onUploaded }: ChildAvatarProps) {
  const c = useThemeColors();
  const [uploading, setUploading] = useState(false);
  // The uploaded URL, until the caller's refetch catches up.
  const [uploaded, setUploaded] = useState<string | null>(null);
  const shown = uploaded || avatarUrl;
  const badge = BADGE[size];

  const pick = async () => {
    if (uploading) return;
    setUploading(true);
    try {
      const url = await pickChildAvatar(childId);
      if (!url) return;
      setUploaded(url);
      onUploaded?.(url);
    } catch (err) {
      showAlert('Error', extractApiError(err, 'Could not update the picture.').message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <Pressable
      onPress={pick}
      disabled={uploading}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={`Change ${firstName}'s profile picture`}
    >
      <View>
        <Avatar size={size}>
          {shown ? (
            <AvatarImage source={{ uri: shown }} />
          ) : (
            <AvatarFallbackText>{initials}</AvatarFallbackText>
          )}
        </Avatar>
        <View
          className="absolute bottom-0 right-0 rounded-full items-center justify-center border-2"
          style={{ width: badge.box, height: badge.box, backgroundColor: c.brand, borderColor: c.card }}
        >
          {uploading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Ionicons name="camera" size={badge.icon} color="#FFFFFF" />
          )}
        </View>
      </View>
    </Pressable>
  );
}
