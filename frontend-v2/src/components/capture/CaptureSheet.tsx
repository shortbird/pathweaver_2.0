/**
 * CaptureSheet - Bottom sheet for quick learning moment capture (mobile).
 *
 * Minimal friction: description + multiple media attachments.
 * Creates moment via JSON, then uploads files individually.
 */

import React, { useState } from 'react';
import { View, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform, Alert, ScrollView } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import api from '@/src/services/api';
import {
  VStack, HStack, UIText, Heading, Button, ButtonText,
} from '../ui';

// File size limits (must match backend constants)
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_VIDEO_SIZE = 50 * 1024 * 1024; // 50MB

interface MediaItem {
  uri: string;
  type: 'image' | 'video';
  name: string;
  fileSize?: number;
}

interface CaptureSheetProps {
  visible: boolean;
  onClose: () => void;
  onCaptured?: () => void;
  /** When set, captures moment for specific student(s) (parent flow) */
  studentIds?: string[];
}

export function CaptureSheet({ visible, onClose, onCaptured, studentIds }: CaptureSheetProps) {
  const [description, setDescription] = useState('');
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setDescription('');
    setMedia([]);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const addMedia = (assets: ImagePicker.ImagePickerAsset[]) => {
    const newItems: MediaItem[] = [];
    for (const asset of assets) {
      const isVideo = asset.type === 'video';
      const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
      const maxMB = maxSize / (1024 * 1024);
      if (asset.fileSize && asset.fileSize > maxSize) {
        const fileMB = (asset.fileSize / (1024 * 1024)).toFixed(1);
        Alert.alert('File too large', `${asset.fileName || (isVideo ? 'Video' : 'Photo')} is ${fileMB}MB. Maximum for ${isVideo ? 'videos' : 'images'} is ${maxMB}MB.`);
        continue;
      }
      newItems.push({
        uri: asset.uri,
        type: isVideo ? 'video' : 'image',
        name: asset.fileName || (isVideo ? 'Video' : 'Photo'),
        fileSize: asset.fileSize,
      });
    }
    if (newItems.length > 0) {
      setMedia((prev) => [...prev, ...newItems]);
    }
  };

  const removeMedia = (index: number) => {
    setMedia((prev) => prev.filter((_, i) => i !== index));
  };

  const openCamera = async () => {
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Camera permission is required.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      videoMaxDuration: 120,
    });
    if (!result.canceled && result.assets.length > 0) {
      addMedia(result.assets);
    }
  };

  const pickFiles = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.8,
      allowsMultipleSelection: true,
    });
    if (!result.canceled && result.assets.length > 0) {
      addMedia(result.assets);
    }
  };

  const uploadAndAttach = async (eventId: string, items: MediaItem[]) => {
    // Step 1: Upload via shared /api/uploads/evidence endpoint
    const fd = new FormData();
    items.forEach((item) => {
      const filename = item.uri.split('/').pop() || `capture.${item.type === 'image' ? 'jpg' : 'mp4'}`;
      const mimeType = item.type === 'video' ? 'video/mp4' : 'image/jpeg';
      fd.append('files', { uri: item.uri, name: filename, type: mimeType } as any);
    });
    const uploadRes = await api.post('/api/uploads/evidence', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    const uploadedFiles = uploadRes.data?.files || [];

    // Step 2: Save as evidence blocks on the event
    if (uploadedFiles.length > 0) {
      const blocks = uploadedFiles.map((f: any, i: number) => {
        const blockType = f.content_type?.startsWith('video/') ? 'video' :
                          f.content_type?.startsWith('image/') ? 'image' : 'document';
        return {
          block_type: blockType,
          content: {},
          file_url: f.url,
          file_name: f.original_name || f.stored_name,
          order_index: i,
        };
      });
      await api.post(`/api/learning-events/${eventId}/evidence`, { blocks });
    }
  };

  const createMoment = async (studentId?: string) => {
    const body: Record<string, any> = {
      description: description.trim() || 'Learning moment',
      source_type: studentId ? 'parent' : 'realtime',
    };
    if (studentId) body.student_id = studentId;
    const { data } = await api.post('/api/learning-events/quick', body);
    return data.event?.id;
  };

  const handleSave = async () => {
    if (!description.trim() && media.length === 0) return;

    setSaving(true);
    try {
      if (studentIds && studentIds.length > 0) {
        for (const sid of studentIds) {
          const eventId = await createMoment(sid);
          if (eventId && media.length > 0) {
            await uploadAndAttach(eventId, media);
          }
        }
      } else {
        const eventId = await createMoment();
        if (eventId && media.length > 0) {
          await uploadAndAttach(eventId, media);
        }
      }

      reset();
      onClose();
      onCaptured?.();
    } catch (err: any) {
      const msg = err.response?.data?.error?.message || err.response?.data?.error || 'Failed to save';
      Alert.alert('Error', msg);
    } finally {
      setSaving(false);
    }
  };

  const canSave = description.trim().length > 0 || media.length > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        className="flex-1 justify-end"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Backdrop */}
        <Pressable
          className="flex-1"
          style={{ backgroundColor: 'rgba(0,0,0,0.4)' }}
          onPress={handleClose}
        />

        {/* Sheet */}
        <View
          style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 32 }}
        >
          {/* Handle */}
          <View className="w-10 h-1 bg-surface-300 rounded-full self-center mb-4" />

          <VStack space="md">
            {/* Header */}
            <HStack className="items-center justify-between">
              <Heading size="lg">Capture a Moment</Heading>
              <Pressable onPress={handleClose} className="w-8 h-8 rounded-full bg-surface-100 items-center justify-center">
                <Ionicons name="close" size={18} color="#6B7280" />
              </Pressable>
            </HStack>

            {/* Text input */}
            <TextInput
              value={description}
              onChangeText={setDescription}
              placeholder="What did you learn?"
              placeholderTextColor="#9CA3AF"
              multiline
              numberOfLines={3}
              className="bg-surface-50 rounded-xl p-4 text-base font-poppins text-typo min-h-[80px]"
              style={{ textAlignVertical: 'top' }}
            />

            {/* Media previews */}
            {media.length > 0 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <HStack className="gap-2">
                  {media.map((item, index) => (
                    <View
                      key={index}
                      className="flex-row items-center gap-2 bg-optio-purple/5 px-3 py-2 rounded-xl border border-optio-purple/20"
                    >
                      <Ionicons
                        name={item.type === 'video' ? 'videocam' : 'image'}
                        size={16}
                        color="#6D469B"
                      />
                      <UIText size="xs" className="text-optio-purple font-poppins-medium" numberOfLines={1} style={{ maxWidth: 100 }}>
                        {item.name}
                      </UIText>
                      <Pressable onPress={() => removeMedia(index)}>
                        <Ionicons name="close-circle" size={18} color="#9CA3AF" />
                      </Pressable>
                    </View>
                  ))}
                </HStack>
              </ScrollView>
            )}

            {/* Attach buttons */}
            <HStack className="gap-3">
              <Pressable
                onPress={openCamera}
                className="flex-1 items-center py-3.5 bg-surface-50 rounded-xl active:bg-surface-100"
              >
                <Ionicons name="camera-outline" size={26} color="#6D469B" />
                <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Camera</UIText>
              </Pressable>
              <Pressable
                className="flex-1 items-center py-3.5 bg-surface-50 rounded-xl active:bg-surface-100 opacity-40"
              >
                <Ionicons name="mic-outline" size={26} color="#6D469B" />
                <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Voice</UIText>
              </Pressable>
              <Pressable
                onPress={pickFiles}
                className="flex-1 items-center py-3.5 bg-surface-50 rounded-xl active:bg-surface-100"
              >
                <Ionicons name="images-outline" size={26} color="#6D469B" />
                <UIText size="xs" className="text-typo-500 mt-1 font-poppins-medium">Files</UIText>
              </Pressable>
            </HStack>

            {/* Save button */}
            <Button
              size="lg"
              onPress={handleSave}
              disabled={!canSave || saving}
              loading={saving}
              className="w-full"
            >
              <ButtonText>{saving ? 'Saving...' : 'Save Moment'}</ButtonText>
            </Button>
          </VStack>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
